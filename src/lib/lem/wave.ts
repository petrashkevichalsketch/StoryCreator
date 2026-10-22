// Оркестрация генерации волны: сборка промптов из данных проекта,
// обращение к адаптеру, ретраи, валидация, запись истории и узлов.

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { actForLevel } from './acts'
import { buildSystemPrompt, buildRetryAddendum, buildUserPrompt, type PathItem } from './prompts'
import { estimateCost, providerName } from './providers/meta'
import { getAdapter } from './providers/index'
import { isNetworkError, type WaveSpec } from './providers/types'
import { getSettings, buildProviderConfig } from './settings'
import { chainToRoot } from './tree'
import { validateWave } from './validator'

export class WaveError extends Error {
  kind: 'provider' | 'invalid' | 'unknown'
  raw?: string
  constructor(kind: WaveError['kind'], message: string, raw?: string) {
    super(message)
    this.kind = kind
    this.raw = raw
  }
}

const NETWORK_PAUSES = [2000, 8000]

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Сетевые сбои: до двух повторов с экспоненциальной паузой 2 с, 8 с (раздел 6.5) */
async function callWithNetworkRetry<T>(fn: () => Promise<T>, onRetry?: (attempt: number, e: Error) => void): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= NETWORK_PAUSES.length; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e as Error
      if (attempt < NETWORK_PAUSES.length && isNetworkError(lastError)) {
        onRetry?.(attempt + 1, lastError)
        await sleep(NETWORK_PAUSES[attempt])
        continue
      }
      throw lastError
    }
  }
  throw lastError ?? new Error('Неизвестная ошибка')
}

export interface GenerateWaveInput {
  projectId: string
  nodeId: string
  lem: boolean
  /** для регенерации: перечень заголовков, которые нельзя повторять */
  excludeTitles?: string[]
}

export interface GenerateWaveResult {
  generationId: string
  nodeIds: string[]
  quip?: string
}

export async function generateWaveForNode(input: GenerateWaveInput): Promise<GenerateWaveResult> {
  const project = await db.project.findUnique({ where: { id: input.projectId } })
  if (!project) throw new WaveError('unknown', 'Проект не найден')
  if (!project.category) throw new WaveError('unknown', 'Сначала выберите категорию романа')

  const parentNode = await db.plotNode.findFirst({ where: { id: input.nodeId, projectId: project.id } })
  if (!parentNode) throw new WaveError('unknown', 'Узел не найден в проекте')

  const settings = await getSettings()
  const provider = project.provider || settings.provider
  const model = project.model || settings.model || undefined
  const cfg = await buildProviderConfig(provider, model ? { model } : undefined)
  const adapter = getAdapter(provider)

  const nextLevel = parentNode.level + 1
  const act = actForLevel(nextLevel)

  // пройденный путь: от корня до родителя включительно
  const allNodes = await db.plotNode.findMany({ where: { projectId: project.id } })
  const chain = chainToRoot(allNodes, parentNode.id)
  const path: PathItem[] = chain
    .filter((n) => n.level >= 1)
    .map((n) => ({
      level: n.level,
      title: n.title,
      description: n.description,
      consequences: n.consequences,
      editedByAuthor: n.editedByAuthor,
    }))

  // не повторять прежние варианты: все дети узла из прошлых волн
  const siblings = allNodes.filter((n) => n.parentId === parentNode.id)
  const excludedTitles = input.excludeTitles ?? Array.from(new Set(siblings.map((n) => n.title)))

  const spec: WaveSpec = {
    category: project.category,
    premise: project.premise,
    act: act.name,
    actFocus: act.focus,
    level: nextLevel,
    n: settings.waveSize,
    lem: input.lem,
    path,
    excludedTitles,
  }

  const system = buildSystemPrompt(settings.waveSize, input.lem)
  const user =
    buildUserPrompt({
      category: project.category,
      premise: project.premise,
      level: nextLevel,
      path,
      excludedTitles,
      n: settings.waveSize,
      lemHint: input.lem,
    })

  const requestPrompt = `${system}\n\n---\n\n${user}`

  const runCall = (withRetryNote: string | null) =>
    callWithNetworkRetry(() => adapter.generate(cfg, withRetryNote ? system : system, withRetryNote ? user + withRetryNote : user, { timeoutMs: 90_000, wave: spec }))

  // попытка 1
  let result
  try {
    result = await runCall(null)
  } catch (e) {
    const generation = await db.generation.create({
      data: {
        id: randomUUID(),
        projectId: project.id,
        level: nextLevel,
        requestPrompt,
        rawResponse: '',
        validated: false,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        provider,
        model: cfg.model,
        status: 'error',
        errorText: (e as Error).message,
      },
    })
    void generation
    throw new WaveError('provider', (e as Error).message)
  }

  // валидация; при провале — повторный запрос с текстом ошибки (раздел 6.4)
  let validation = validateWave(result.raw, act.name)
  let finalRaw = result.raw
  let tokensIn = result.tokensIn
  let tokensOut = result.tokensOut

  if (!validation.ok) {
    try {
      const retry = await runCall(buildRetryAddendum(validation.error ?? 'неизвестная ошибка валидации'))
      finalRaw = retry.raw
      tokensIn = tokensIn + retry.tokensIn
      tokensOut = tokensOut + retry.tokensOut
      validation = validateWave(retry.raw, act.name)
    } catch (e) {
      await db.generation.create({
        data: {
          id: randomUUID(),
          projectId: project.id,
          level: nextLevel,
          requestPrompt,
          rawResponse: finalRaw,
          validated: false,
          tokensIn,
          tokensOut,
          costUsd: estimateCost(provider, tokensIn, tokensOut),
          provider,
          model: cfg.model,
          status: 'error',
          errorText: (e as Error).message,
        },
      })
      throw new WaveError('provider', (e as Error).message)
    }
  }

  if (!validation.ok || !validation.wave) {
    await db.generation.create({
      data: {
        id: randomUUID(),
        projectId: project.id,
        level: nextLevel,
        requestPrompt,
        rawResponse: finalRaw,
        validated: false,
        tokensIn,
        tokensOut,
        costUsd: estimateCost(provider, tokensIn, tokensOut),
        provider,
        model: cfg.model,
        status: 'invalid',
        errorText: validation.error ?? 'валидация не пройдена',
      },
    })
    throw new WaveError(
      'invalid',
      'Модель дважды вернула ответ, не прошедший валидацию. Ниже — сырой текст ответа; можно попробовать снова.',
      finalRaw
    )
  }

  const wave = validation.wave
  const generationId = randomUUID()
  await db.generation.create({
    data: {
      id: generationId,
      projectId: project.id,
      level: nextLevel,
      requestPrompt,
      rawResponse: finalRaw,
      validated: true,
      tokensIn,
      tokensOut,
      costUsd: estimateCost(provider, tokensIn, tokensOut),
      provider,
      model: cfg.model,
      status: 'ok',
      quip: wave.quip ?? null,
    },
  })

  const nodeIds: string[] = []
  for (const opt of wave.options) {
    const id = randomUUID()
    nodeIds.push(id)
    await db.plotNode.create({
      data: {
        id,
        projectId: project.id,
        parentId: parentNode.id,
        level: nextLevel,
        act: act.name,
        title: opt.title,
        description: opt.description,
        consequences: opt.consequences,
        tone: opt.tone,
        tags: JSON.stringify(opt.tags),
        generationId,
      },
    })
  }
  await db.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } })

  void providerName
  return { generationId, nodeIds, quip: wave.quip }
}
