// Метаданные провайдеров — общий модуль (безопасен для импорта в браузере).
// Пять провайдеров из ТЗ (таблица 5) + встроенная модель Z.ai для работы
// без ключей + шлюз AIAI.BY + офлайн демо-генератор.

import type { ProviderCode } from '../types'

export interface ProviderMeta {
  code: ProviderCode
  name: string
  short: string
  needsKey: boolean
  builtIn?: boolean
  defaultModel: string
  models: string[]
  baseUrl?: string
  baseUrlEditable?: boolean
  /** список моделей подтягивается с сайта провайдера через /api/providers/models */
  dynamicModels?: boolean
  note: string
}

export const PROVIDERS: ProviderMeta[] = [
  {
    code: 'zai',
    name: 'Z.ai · встроенная модель',
    short: 'Z.ai',
    needsKey: false,
    builtIn: true,
    defaultModel: 'glm-4.6',
    models: ['glm-4.6'],
    note: 'Работает сразу, без API-ключа — удобно для знакомства с конструктором.',
  },
  {
    code: 'openai',
    name: 'OpenAI',
    short: 'OpenAI',
    needsKey: true,
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    baseUrl: 'https://api.openai.com/v1',
    baseUrlEditable: true,
    note: 'Ключ вида sk-…; базовый URL api.openai.com.',
  },
  {
    code: 'anthropic',
    name: 'Anthropic Claude',
    short: 'Claude',
    needsKey: true,
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'],
    note: 'Аутентификация заголовком x-api-key.',
  },
  {
    code: 'glm',
    name: 'Z.ai GLM',
    short: 'GLM',
    needsKey: true,
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4.5', 'glm-4-air'],
    baseUrl: 'https://api.z.ai/api/paas/v4',
    baseUrlEditable: true,
    note: 'OpenAI-совместимый REST; endpoint https://api.z.ai/api/paas/v4.',
  },
  {
    code: 'deepseek',
    name: 'DeepSeek',
    short: 'DeepSeek',
    needsKey: true,
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    baseUrl: 'https://api.deepseek.com',
    baseUrlEditable: true,
    note: 'OpenAI-совместимый REST; endpoint https://api.deepseek.com.',
  },
  {
    code: 'aiai',
    name: 'AIAI.BY (400+ моделей)',
    short: 'AIAI.BY',
    needsKey: true,
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-5.1', 'claude-sonnet-4.5', 'gemini-2.5-flash', 'deepseek-chat', 'glm-4.6', 'aion-3.5-mini'],
    baseUrl: 'https://api.aiai.by/v1',
    baseUrlEditable: true,
    dynamicModels: true,
    note: 'OpenAI-совместимый шлюз к 400+ моделям (GPT, Claude, Gemini, DeepSeek…); оплата в BYN, без VPN. Список моделей подтягивается с api.aiai.by.',
  },
  {
    code: 'ollama',
    name: 'Ollama (локально)',
    short: 'Ollama',
    needsKey: false,
    defaultModel: 'qwen2.5:14b',
    models: ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.1:8b'],
    baseUrl: 'http://localhost:11434',
    baseUrlEditable: true,
    note: 'Без ключа; полностью офлайн — требуется запущенный Ollama на машине.',
  },
  {
    code: 'demo',
    name: 'Демо-шаблоны (офлайн)',
    short: 'Демо',
    needsKey: false,
    builtIn: true,
    defaultModel: 'demo-templates',
    models: ['demo-templates'],
    note: 'Локальные сюжетные шаблоны без сети и без расходов; качество ниже живой модели.',
  },
]

export function providerMeta(code: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.code === code)
}

export function providerName(code: string): string {
  return providerMeta(code)?.name ?? code
}

/** Оценка стоимости, USD за 1M токенов (вход/выход) — ориентировочная */
export const PRICE_PER_MTOK: Record<string, [number, number]> = {
  openai: [0.15, 0.6],
  anthropic: [3, 15],
  glm: [7, 7],
  deepseek: [0.27, 1.1],
  // грубая оценка в USD; фактические цены AIAI.BY в BYN зависят от модели (aiai.by/pricing)
  aiai: [1, 2],
  ollama: [0, 0],
  zai: [0, 0],
  demo: [0, 0],
}

export function estimateCost(provider: string, tokensIn: number, tokensOut: number): number {
  const price = PRICE_PER_MTOK[provider] ?? [0, 0]
  return (tokensIn / 1_000_000) * price[0] + (tokensOut / 1_000_000) * price[1]
}
