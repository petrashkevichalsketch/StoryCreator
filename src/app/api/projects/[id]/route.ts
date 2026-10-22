import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProjectPayload } from '@/lib/lem/tree'
import { jsonError } from '@/lib/lem/api'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const payload = await getProjectPayload(id)
  if (!payload) return jsonError('Проект не найден', 404)
  return NextResponse.json(payload)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const project = await db.project.findUnique({ where: { id } })
  if (!project) return jsonError('Проект не найден', 404)
  // внешние ключи с каскадным удалением: узлы и генерации удаляются вместе с проектом
  await db.project.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
