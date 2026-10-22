import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProjectPayload } from '@/lib/lem/tree'
import { serializeLemJson } from '@/lib/lem/export'
import { contentDisposition, jsonError } from '@/lib/lem/api'

/** FR-7.4: экспорт проекта одним файлом .lem.json */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const payload = await getProjectPayload(id)
  if (!payload) return jsonError('Проект не найден', 404)

  const generations = await db.generation.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } })
  const serialized = serializeLemJson(payload, generations)
  const safeName = (payload.project.name || 'проект').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)

  return new NextResponse(JSON.stringify(serialized, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': contentDisposition(`${safeName}.lem.json`),
    },
  })
}
