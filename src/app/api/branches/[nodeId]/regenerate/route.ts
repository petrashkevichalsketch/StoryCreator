import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateWaveForNode } from '@/lib/lem/wave'
import { getProjectPayload } from '@/lib/lem/tree'
import { jsonError, waveErrorResponse } from '@/lib/lem/api'

/**
 * FR-4: перегенерация волны без повторов; отвергнутая волна
 * остаётся в базе и отображается на карте-дереве
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await ctx.params
  const node = await db.plotNode.findUnique({ where: { id: nodeId } })
  if (!node) return jsonError('Узел не найден', 404)

  const project = await db.project.findUnique({ where: { id: node.projectId } })
  if (!project) return jsonError('Проект не найден', 404)
  if (node.isFinal) return jsonError('Сюжет финализирован — «(конец)».', 409)

  try {
    await generateWaveForNode({
      projectId: node.projectId,
      nodeId,
      lem: false,
      excludeTitles: (await db.plotNode.findMany({ where: { parentId: nodeId }, select: { title: true } })).map((n) => n.title),
    })
    const payload = await getProjectPayload(node.projectId)
    return NextResponse.json({ payload })
  } catch (e) {
    return waveErrorResponse(e)
  }
}
