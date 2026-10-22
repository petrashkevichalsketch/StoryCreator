// Контракт ответа модели и валидация — раздел 6.4 ТЗ.
// Нормализация (обрезка пробелов, регистр tone) выполняется до валидации.

import { z } from 'zod'
import { TONES, type Tone } from './types'

const TONE_ALIASES: Record<string, Tone> = {
  dark: 'dark',
  light: 'light',
  ironic: 'ironic',
  neutral: 'neutral',
  'мрачно': 'dark',
  'мрачный': 'dark',
  'тёмный': 'dark',
  'темный': 'dark',
  'светло': 'light',
  'светлый': 'light',
  'иронично': 'ironic',
  'ироничный': 'ironic',
  'нейтрально': 'neutral',
  'нейтральный': 'neutral',
}

export const MAX_TITLE_LEN = 80

const rawOption = z.object({
  title: z.string(),
  description: z.string(),
  consequences: z.string(),
  tone: z.string(),
  tags: z.array(z.string()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
})

const rawResponse = z.object({
  act: z.string(),
  level: z.union([z.number(), z.string()]).optional(),
  options: z.array(rawOption),
  quip: z.unknown().optional(),
})

export interface NormalizedOption {
  title: string
  description: string
  consequences: string
  tone: Tone
  tags: string[]
}

export interface NormalizedWave {
  act: string
  options: NormalizedOption[]
  quip?: string
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function normalizeTone(value: string): Tone | null {
  const key = value.trim().toLowerCase().replace(/[^a-zа-яё]/gi, '')
  return TONE_ALIASES[key] ?? null
}

/** Ремонт типовых сбоев JSON от модели: незакрытая кавычка ключа, висячая запятая */
function repairJson(text: string): string {
  return text
    // "tags:[...  ->  "tags": [...   (модель потеряла закрывающую кавычку ключа)
    .replace(/"(\w+)\s*:\s*(?=[\[{"])/g, '"$1": ')
    // {"a":1,} -> {"a":1}
    .replace(/,\s*([}\]])/g, '$1')
}

/** Извлечение JSON из сырого ответа: срезает код-ограждения и окружающий текст */
export function extractJson(raw: string): unknown {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(repairJson(text))
  }
}

/** Нормализация до валидации: пробелы, регистр tone, теги ≤ 3, длина title ≤ 80 */
export function normalizeWave(data: unknown, maxOptions = 10): NormalizedWave | { error: string } {
  const parsed = rawResponse.safeParse(data)
  if (!parsed.success) {
    return { error: 'ответ не является JSON-объектом ожидаемой формы (нужны поля act, level, options)' }
  }
  const d = parsed.data
  if (!Array.isArray(d.options) || d.options.length < 5) {
    return { error: `поле options должно содержать от 5 до 10 объектов, получено ${d.options?.length ?? 0}` }
  }

  const options: NormalizedOption[] = []
  for (let i = 0; i < Math.min(d.options.length, maxOptions); i++) {
    const o = d.options[i]
    const title = clean(String(o.title ?? ''))
    const description = clean(String(o.description ?? ''))
    const consequences = clean(String(o.consequences ?? ''))
    if (!title) return { error: `вариант ${i + 1}: пустой title` }
    if (!description) return { error: `вариант ${i + 1}: пустое description` }
    if (!consequences) return { error: `вариант ${i + 1}: пустое consequences (последствия обязательны)` }
    const tone = normalizeTone(String(o.tone ?? ''))
    if (!tone) return { error: `вариант ${i + 1}: tone «${o.tone}» не входит в допустимое множество (dark, light, ironic, neutral)` }
    const tags = (Array.isArray(o.tags) ? o.tags : [])
      .map((t) => clean(String(t)))
      .filter(Boolean)
      .slice(0, 3)
    options.push({
      title: title.length > MAX_TITLE_LEN ? title.slice(0, MAX_TITLE_LEN - 1) + '…' : title,
      description,
      consequences,
      tone,
      tags,
    })
  }

  const quipRaw = d.quip
  const quip = typeof quipRaw === 'string' && quipRaw.trim() ? clean(quipRaw) : undefined

  return { act: clean(d.act), options, quip }
}

export interface ValidationResult {
  ok: boolean
  wave?: NormalizedWave
  error?: string
}

/** Полная валидация: нормализация + zod-схема + сверка акта */
export function validateWave(raw: string, expectedAct: string): ValidationResult {
  let data: unknown
  try {
    data = extractJson(raw)
  } catch {
    return { ok: false, error: 'не удалось разобрать JSON: ответ модели не является валидным JSON' }
  }

  const normalized = normalizeWave(data)
  if ('error' in normalized) return { ok: false, error: normalized.error }

  const wave = normalized as NormalizedWave

  // zod-схема поверх нормализованных данных — фиксация контракта
  const schema = z.object({
    act: z.string().min(1),
    options: z
      .array(
        z.object({
          title: z.string().min(1).max(MAX_TITLE_LEN),
          description: z.string().min(1),
          consequences: z.string().min(1),
          tone: z.enum(TONES as [string, ...string[]]),
          tags: z.array(z.string()).max(3),
        })
      )
      .min(5)
      .max(10),
    quip: z.string().optional(),
  })
  const check = schema.safeParse(wave)
  if (!check.success) {
    return { ok: false, error: 'структура волны не соответствует контракту: ' + check.error.issues[0]?.message }
  }

  // поле act совпадает с ожидаемым актом уровня
  if (wave.act.toLowerCase() !== expectedAct.toLowerCase()) {
    return { ok: false, error: `поле act «${wave.act}» не совпадает с ожидаемым актом «${expectedAct}»` }
  }

  return { ok: true, wave }
}
