import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProjectPayload } from '@/lib/lem/tree'
import { jsonError } from '@/lib/lem/api'

/**
 * Выбор узла: фиксирует путь; прежнее продолжение остаётся
 * альтернативной веткой (FR-7.3, раздел 8 ТЗ)
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { isFinal?: boolean }

  const node = await db.plotNode.findUnique({ where: { id: nodeId } })
  if (!node) return jsonError('Узел не найден', 404)
  if (node.level === 0) return jsonError('Корневой узел выбирается через категорию')

  // снимаем флаг с прежнего продолжения, но не удаляем его
  await db.plotNode.updateMany({ where: { parentId: node.parentId, isChosen: true }, data: { isChosen: false } })
  await db.plotNode.update({
    where: { id: nodeId },
    data: { isChosen: true, ...(body.isFinal ? { isFinal: true } : {}) },
  })
  await db.project.update({ where: { id: node.projectId }, data: { currentNodeId: nodeId } })

  const payload = await getProjectPayload(node.projectId)
  return NextResponse.json(payload)
}
