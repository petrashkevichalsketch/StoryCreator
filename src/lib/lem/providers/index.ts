// Реестр адаптеров: приводят API конкретного провайдера
// к единому внутреннему интерфейсу (раздел 6.1 ТЗ)

import { openAILike } from './openai-like'
import { anthropicAdapter } from './anthropic'
import { ollamaAdapter } from './ollama'
import { zaiAdapter } from './zai'
import { demoAdapter } from './demo'
import type { LLMAdapter } from './types'

const ADAPTERS: Record<string, LLMAdapter> = {
  openai: openAILike('openai', 'https://api.openai.com/v1'),
  glm: openAILike('glm', 'https://api.z.ai/api/paas/v4'),
  deepseek: openAILike('deepseek', 'https://api.deepseek.com'),
  aiai: openAILike('aiai', 'https://api.aiai.by/v1'),
  anthropic: anthropicAdapter,
  ollama: ollamaAdapter,
  zai: zaiAdapter,
  demo: demoAdapter,
}

export function getAdapter(code: string): LLMAdapter {
  const adapter = ADAPTERS[code]
  if (!adapter) throw new Error(`Неизвестный провайдер: ${code}`)
  return adapter
}

export { anthropicAdapter, demoAdapter, ollamaAdapter, zaiAdapter }
