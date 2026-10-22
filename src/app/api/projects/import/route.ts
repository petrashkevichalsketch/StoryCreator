import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { parseLemJson } from '@/lib/lem/export'
import { jsonError } from '@/lib/lem/api'

/** FR-7.4: импорт проекта из файла .lem.json */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  if (!raw) return jsonError('Файл не распознан как JSON')

  let data
  try {
    data = parseLemJson(raw)
  } catch (e) {
    return jsonError('Структура файла не соответствует формату .lem.json: ' + (e as Error).message)
  }

  const projectId = randomUUID()
  const genIdMap = new Map<string, string>()
  for (const n of data.nodes) {
    if (n.generationId && !genIdMap.has(n.generationId)) genIdMap.set(n.generationId, randomUUID())
  }

  const name = data.project.name.slice(0, 120)
  await db.project.create({
    data: {
      id: projectId,
      name,
      category: data.project.category ?? null,
      premise: data.project.premise ?? null,
      provider: data.project.provider ?? null,
      model: data.project.model ?? null,
    },
  })

  for (const g of genIdMap.values()) {
    await db.generation.create({
      data: {
        id: g,
        projectId,
        level: 0,
        requestPrompt: '',
        rawResponse: '',
        validated: true,
        provider: data.project.provider ?? 'import',
        model: data.project.model ?? 'import',
        status: 'imported',
      },
    })
  }

  const idMap = new Map<string, string>()
  for (const n of data.nodes) idMap.set(n.id, randomUUID())

  let currentNodeId: string | null = null
  let deepest = -1

  for (const n of data.nodes) {
    await db.plotNode.create({
      data: {
        id: idMap.get(n.id)!,
        projectId,
        parentId: n.parentId ? idMap.get(n.parentId) ?? null : null,
        level: n.level,
        act: n.act,
        title: n.title,
        description: n.description,
        consequences: n.consequences,
        tone: n.tone ?? null,
        tags: JSON.stringify(n.tags),
        isChosen: n.isChosen,
        isLem: n.isLem,
        quip: n.quip ?? null,
        isFinal: n.isFinal,
        generationId: n.generationId ? genIdMap.get(n.generationId) ?? null : null,
        createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
      },
    })
    if (n.isChosen && n.level > deepest) {
      deepest = n.level
      currentNodeId = idMap.get(n.id)!
    }
  }

  await db.project.update({ where: { id: projectId }, data: { currentNodeId } })
  return NextResponse.json({ id: projectId })
}
