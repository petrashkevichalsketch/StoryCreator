import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateWaveForNode } from '@/lib/lem/wave'
import { getProjectPayload } from '@/lib/lem/tree'
import { BASE_LEVELS } from '@/lib/lem/acts'
import { jsonError, waveErrorResponse } from '@/lib/lem/api'

const FALLBACK_QUIPS = [
  'И все погибли, но график сдан в срок.',
  'Лем бы одобрил: кнопка «конец» нажалась сама.',
  'Вариант взят наугад, как и велит наука.',
  'Развилка выбрала вас, а не наоборот.',
  'Продолжение следует. Или нет.',
  'Не самый худший из возможных миров.',
]

/** Шаг режима Лема: случайная развилка на текущем уровне (FR-5) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action && body.action !== 'step') {
    return jsonError('Поддерживается действие step')
  }

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return jsonError('Проект не найден', 404)
  if (!project.category) return jsonError('Сначала выберите категорию романа')

  let current = project.currentNodeId ? await db.plotNode.findUnique({ where: { id: project.currentNodeId } }) : null
  if (!current) return jsonError('У проекта нет текущего узла', 409)

  let quip: string | null = null

  try {
    if (current.isFinal) {
      const payload = await getProjectPayload(id)
      return NextResponse.json({ done: true, payload })
    }

    let children = await db.plotNode.findMany({ where: { parentId: current.id, projectId: id }, orderBy: { createdAt: 'asc' } })

    if (!children.length) {
      await generateWaveForNode({ projectId: id, nodeId: current.id, lem: true })
      children = await db.plotNode.findMany({ where: { parentId: current.id, projectId: id }, orderBy: { createdAt: 'asc' } })
    }

    const waveGeneration = children.find((c) => c.isChosen)?.generationId ?? children[children.length - 1]?.generationId
    const wave = waveGeneration ? children.filter((c) => c.generationId === waveGeneration) : children

    const pickId = wave[Math.floor(Math.random() * wave.length)].id
    // реплика волны; если волна была сгенерирована вне режима Лема — локальная ирония
    const generation = waveGeneration ? await db.generation.findUnique({ where: { id: waveGeneration } }) : null
    quip = generation?.quip ?? FALLBACK_QUIPS[Math.floor(Math.random() * FALLBACK_QUIPS.length)]

    // у родителя не более одного is_chosen: прежнее продолжение снимается, но не удаляется
    await db.plotNode.updateMany({ where: { parentId: current.id, isChosen: true }, data: { isChosen: false } })
    const selected = await db.plotNode.update({
      where: { id: pickId },
      data: { isChosen: true, isLem: true, quip },
    })

    const done = selected.level >= BASE_LEVELS
    if (done) {
      await db.plotNode.update({ where: { id: selected.id }, data: { isFinal: true } })
    }
    await db.project.update({ where: { id }, data: { currentNodeId: selected.id } })

    const payload = await getProjectPayload(id)
    return NextResponse.json({ done, nodeId: selected.id, quip, payload })
  } catch (e) {
    return waveErrorResponse(e)
  }
}
