// Дерево проекта: путь восстанавливается от текущего узла вверх
// по ссылкам parent_id (раздел 8 ТЗ)

import type { PlotNode } from '@prisma/client'
import { db } from '@/lib/db'
import type { NodeDTO, Tone, TreePayload } from './types'

export function toNodeDTO(n: PlotNode): NodeDTO {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(n.tags || '[]')
    if (Array.isArray(parsed)) tags = parsed.map(String)
  } catch {
    tags = []
  }
  return {
    id: n.id,
    parentId: n.parentId,
    level: n.level,
    act: n.act,
    title: n.title,
    description: n.description,
    consequences: n.consequences,
    tone: (n.tone as Tone | null) ?? null,
    tags,
    isChosen: n.isChosen,
    isLem: n.isLem,
    quip: n.quip,
    isFinal: n.isFinal,
    generationId: n.generationId,
    createdAt: n.createdAt.toISOString(),
  }
}

/** Цепочка узлов от указанного узла вверх до корня (в порядке корень → узел) */
export function chainToRoot(nodes: PlotNode[], fromId: string | null): PlotNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const chain: PlotNode[] = []
  let cur = fromId ? byId.get(fromId) : undefined
  let guard = 0
  while (cur && guard < 500) {
    guard++
    chain.push(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return chain.reverse()
}

export async function getProjectPayload(projectId: string): Promise<TreePayload | null> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return null
  const nodes = await db.plotNode.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  })
  const dto = nodes.map(toNodeDTO)
  const chain = chainToRoot(nodes, project.currentNodeId)
  const activePathIds = chain.map((n) => n.id)
  const currentNode = dto.find((n) => n.id === project.currentNodeId) ?? null
  return {
    project: {
      id: project.id,
      name: project.name,
      category: project.category,
      premise: project.premise,
      provider: project.provider,
      model: project.model,
      currentNodeId: project.currentNodeId,
      updatedAt: project.updatedAt.toISOString(),
    },
    nodes: dto,
    activePathIds,
    path: chain.map(toNodeDTO),
    currentNode,
  }
}

/**
 * Волна для отображения конструктора у узла X:
 * — если у X есть выбранный ребёнок — та волна (поколение), из которой его выбрали;
 * — иначе — последнее поколение детей (свежая волна);
 * — если детей нет — null (нужна генерация).
 */
export function currentWaveFor(nodes: NodeDTO[], nodeId: string): NodeDTO[] {
  const children = nodes.filter((n) => n.parentId === nodeId)
  if (!children.length) return []
  const chosen = children.find((c) => c.isChosen)
  const generationId = chosen?.generationId ?? children[children.length - 1].generationId
  if (!generationId) return children
  const wave = children.filter((c) => c.generationId === generationId)
  return wave.length ? wave : children
}
