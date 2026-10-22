import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { jsonError } from '@/lib/lem/api'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const source = await db.project.findUnique({ where: { id } })
  if (!source) return jsonError('Проект не найден', 404)

  const nodes = await db.plotNode.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } })

  const newId = randomUUID()
  const idMap = new Map<string, string>()
  for (const n of nodes) idMap.set(n.id, randomUUID())

  await db.project.create({
    data: {
      id: newId,
      name: `${source.name} (копия)`.slice(0, 120),
      category: source.category,
      premise: source.premise,
      provider: source.provider,
      model: source.model,
      currentNodeId: source.currentNodeId ? idMap.get(source.currentNodeId) ?? null : null,
    },
  })

  for (const n of nodes) {
    await db.plotNode.create({
      data: {
        id: idMap.get(n.id)!,
        projectId: newId,
        parentId: n.parentId ? idMap.get(n.parentId) ?? null : null,
        level: n.level,
        act: n.act,
        title: n.title,
        description: n.description,
        consequences: n.consequences,
        tone: n.tone,
        tags: n.tags,
        isChosen: n.isChosen,
        isLem: n.isLem,
        quip: n.quip,
        isFinal: n.isFinal,
        generationId: n.generationId,
        createdAt: n.createdAt,
      },
    })
  }

  return NextResponse.json({ id: newId })
}
