import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProjectPayload } from '@/lib/lem/tree'
import { jsonError } from '@/lib/lem/api'

/** Возврат к узлу: отвергнутое продолжение сохраняется как альтернатива (FR-7.3) */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await ctx.params
  const node = await db.plotNode.findUnique({ where: { id: nodeId } })
  if (!node) return jsonError('Узел не найден', 404)

  await db.project.update({ where: { id: node.projectId }, data: { currentNodeId: nodeId } })
  const payload = await getProjectPayload(node.projectId)
  return NextResponse.json(payload)
}
