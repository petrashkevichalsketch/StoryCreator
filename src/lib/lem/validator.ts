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

/**
 * Автозакрытие обрезанного JSON: модель часто теряет последние 1-2 закрывающие
 * скобки (обрезка по лимиту токенов). Сканируем строку ВНЕ строковых значений,
 * ведём стек открытых { и [ и дописываем недостающие закрывающие. При малейшем
 * рассинхроне скобок ремонт не применяется — ответ уйдёт в ретрай как есть.
 */
export function autoCloseJson(text: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') {
      if (!stack.length || stack[stack.length - 1] !== ch) return text // рассинхрон — не чиним
      stack.pop()
    }
  }
  if (!stack.length && !inString) return text
  return text + (inString ? '"' : '') + stack.reverse().join('')
}

/** Извлечение JSON из сырого ответа: срезает код-ограждения и окружающий текст */
export function extractJson(raw: string): unknown {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  if (start < 0) throw new Error('в ответе модели нет JSON-объекта')
  const end = text.lastIndexOf('}')
  // кандидат 1: срез до последней '}' (обычный случай — проза вокруг JSON);
  // кандидат 2: срез до конца (обрезанный ответ — допишем скобки ниже)
  const candidates = end > start ? [text.slice(start, end + 1), text.slice(start)] : [text.slice(start)]
  let lastError: unknown
  for (const candidate of candidates) {
    for (const attempt of [candidate, repairJson(candidate), autoCloseJson(candidate), repairJson(autoCloseJson(candidate))]) {
      try {
        return JSON.parse(attempt)
      } catch (e) {
        lastError = e
      }
    }
  }
  throw lastError ?? new Error('не удалось разобрать JSON')
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

/* ---------------- Правка варианта вручную (окно «Редактировать») ---------------- */

export const MAX_EDIT_DESCRIPTION_LEN = 2000
export const MAX_EDIT_CONSEQUENCES_LEN = 500

export interface VariantPatchData {
  title?: string
  description?: string
  consequences?: string
  tone?: Tone | null
}

/**
 * Санитизация ручной правки варианта: трим, лимиты длины, проверка tone.
 * Возвращает либо данные для Prisma update, либо человекочитаемую ошибку.
 */
export function sanitizeVariantPatch(input: unknown): { data: VariantPatchData } | { error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'ожидается JSON-объект с полями правки (title, description, consequences, tone)' }
  }
  const raw = input as Record<string, unknown>
  const data: VariantPatchData = {}

  if (raw.title !== undefined) {
    const title = String(raw.title).replace(/\s+/g, ' ').trim()
    if (!title) return { error: 'название события не может быть пустым' }
    if (title.length > MAX_TITLE_LEN) return { error: `название события не может быть длиннее ${MAX_TITLE_LEN} символов` }
    data.title = title
  }
  if (raw.description !== undefined) {
    const description = String(raw.description).trim()
    if (!description) return { error: 'развитие события не может быть пустым' }
    if (description.length > MAX_EDIT_DESCRIPTION_LEN) {
      return { error: `развитие события не может быть длиннее ${MAX_EDIT_DESCRIPTION_LEN} символов` }
    }
    data.description = description
  }
  if (raw.consequences !== undefined) {
    const consequences = String(raw.consequences).trim()
    if (consequences.length > MAX_EDIT_CONSEQUENCES_LEN) {
      return { error: `последствия не могут быть длиннее ${MAX_EDIT_CONSEQUENCES_LEN} символов` }
    }
    data.consequences = consequences
  }
  if (raw.tone !== undefined) {
    if (raw.tone === null || raw.tone === '') {
      data.tone = null
    } else {
      const tone = normalizeTone(String(raw.tone))
      if (!tone) {
        return { error: `tone «${String(raw.tone)}» не входит в допустимое множество (dark, light, ironic, neutral)` }
      }
      data.tone = tone
    }
  }

  if (!Object.keys(data).length) {
    return { error: 'нет полей для обновления (доступны title, description, consequences, tone)' }
  }
  return { data }
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
