import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { CATEGORY_NAMES } from '@/lib/lem/categories'
import { getProjectPayload } from '@/lib/lem/tree'
import { jsonError } from '@/lib/lem/api'

/** FR-1: категория выбирается один раз и закрепляется на весь проект */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as { category?: string } | null
  const category = body?.category?.trim()
  if (!category || !CATEGORY_NAMES.includes(category)) {
    return jsonError('Выберите одну из восьми предустановленных категорий')
  }

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return jsonError('Проект не найден', 404)
  if (project.category) {
    return jsonError('Категория уже закреплена за проектом. Смена категории создаёт новый проект.', 409)
  }

  const rootId = randomUUID()
  await db.plotNode.create({
    data: {
      id: rootId,
      projectId: id,
      level: 0,
      act: 'Старт',
      title: category,
      isChosen: true,
    },
  })
  await db.project.update({ where: { id }, data: { category, currentNodeId: rootId } })

  const payload = await getProjectPayload(id)
  return NextResponse.json(payload)
}
