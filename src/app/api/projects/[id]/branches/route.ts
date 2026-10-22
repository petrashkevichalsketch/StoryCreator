import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateWaveForNode } from '@/lib/lem/wave'
import { getProjectPayload } from '@/lib/lem/tree'
import { jsonError, waveErrorResponse } from '@/lib/lem/api'

/** Генерация волны уровня для указанного узла (POST /api/projects/:id/branches) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as { nodeId?: string } | null

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return jsonError('Проект не найден', 404)
  if (!project.category) return jsonError('Сначала выберите категорию романа')

  const nodeId = body?.nodeId || project.currentNodeId
  if (!nodeId) return jsonError('Не указан узел для генерации')

  const parent = await db.plotNode.findFirst({ where: { id: nodeId, projectId: id } })
  if (!parent) return jsonError('Узел не найден в проекте', 404)

  const existing = await db.plotNode.count({ where: { parentId: nodeId, projectId: id } })
  if (parent.isFinal && existing === 0) {
    // пользователь передумал финализировать — углубляем эпилог, снимаем «(конец)»
    await db.plotNode.update({ where: { id: parent.id }, data: { isFinal: false } })
  } else if (parent.isFinal) {
    return jsonError('Сюжет финализирован — «(конец)». Углубление доступно через возврат к узлу.', 409)
  }
  if (existing > 0) {
    // волна уже существует — возвращаем проект без повторной генерации
    const payload = await getProjectPayload(id)
    return NextResponse.json({ payload, alreadyExists: true })
  }

  try {
    await generateWaveForNode({ projectId: id, nodeId, lem: false })
    const payload = await getProjectPayload(id)
    return NextResponse.json({ payload })
  } catch (e) {
    return waveErrorResponse(e)
  }
}
