// Промпты «Калькулятора Лема» — эталонные тексты из разделов 6.2–6.3 ТЗ.
// Правки текста допускаются только по согласованию с заказчиком.

import { actForLevel } from './acts'

export interface PathItem {
  level: number
  title: string
  description: string
  consequences: string
}

export interface UserPromptInput {
  category: string
  premise?: string | null
  /** уровень, ДЛЯ которого генерируется волна (родитель.level + 1) */
  level: number
  /** пройденный путь: выбранные узлы от корня до родителя включительно */
  path: PathItem[]
  excludedTitles: string[]
  n: number
  /** показывать ли поле quip в схеме ответа (режим Лема) */
  lemHint?: boolean
}

const SYSTEM_TEMPLATE = `Ты — «Калькулятор Лема», сюжетный архитектор романов.
Твоя единственная задача — придумывать сюжетные развилки.

ПРАВИЛА:
1. В ответ на запрос предложи {N} вариантов развития сюжета (от 5 до 10) — строго в формате JSON, без какого-либо текста вокруг.
2. Каждый вариант содержит:
title — цепляющий заголовок до 10 слов;
description — 1-2 предложения о том, что происходит;
consequences — 1-3 предложения МЕЛКИХ последствий: к чему этот выбор приведёт позже; не пересказывай description, а смотри вперёд;
tone — ровно один из: dark, light, ironic, neutral;
tags — до трёх коротких тегов.
3. Варианты обязаны реально различаться: не градации одного хода, а разные направления. Минимум один неожиданный и минимум один самый очевидный, «лобовой».
4. Уважай выбранный путь: не противоречь фактам, именам и судьбам, уже зафиксированным в контексте запроса.
5. Держи категорию романа и её условности; избегай клише, если выбранный путь не требует их намеренно.
{LEM_RULE}
{LAST_RULES} Формат ответа — только валидный JSON по схеме из запроса, без markdown-обёрток и пояснений.`

const LEM_RULE = '6. В режиме Лема дополнительно верни поле quip — одну ироничную фразу (до 12 слов) в духе блок-схемы Станислава Лема 1973 года.'

/**
 * Системный промпт. Правило 6 (quip) добавляется только в шагах
 * автоматического прохождения — режим Лема.
 */
export function buildSystemPrompt(n: number, lemMode: boolean): string {
  const lastRules = lemMode ? '7. Отвечай по-русски, живым конкретным языком, без канцелярита.\n8.' : '6. Отвечай по-русски, живым конкретным языком, без канцелярита.\n7.'
  return SYSTEM_TEMPLATE.replace('{N}', String(n)).replace('{LEM_RULE}', lemMode ? LEM_RULE : '').replace('{LAST_RULES}', lastRules)
}

export function buildUserPrompt(input: UserPromptInput): string {
  const act = actForLevel(input.level)
  const levelLine =
    input.level <= 12
      ? `Акт: ${act.name} — уровень ${input.level} из 12.`
      : `Акт: ${act.name} — уровень ${input.level} (углубление эпилога).`

  const pathLines = input.path.length
    ? input.path
        .map(
          (p) =>
            `${p.level}. ${p.title} — ${p.description}${p.consequences ? `; последствия, уже заявленные ранее: ${p.consequences}` : ''}`
        )
        .join('\n')
    : '(путь пуст — это первая волна)'

  const excluded = input.excludedTitles.length ? input.excludedTitles.join(' | ') : 'нет'

  return `Категория романа: ${input.category}
Посылка автора: ${input.premise?.trim() || 'нет'}
${levelLine}
Задача уровня: ${act.focus}

Пройденный путь (не противоречь ему):
${pathLines}

Не повторяй эти варианты предыдущей волны: ${excluded}

Предложи ${input.n} развилок для следующего уровня по схеме ответа.

Схема ответа (строгий JSON, без markdown-обёрток):
{"act":"${act.name}","level":${input.level},"options":[{"title":"...","description":"...","consequences":"...","tone":"dark|light|ironic|neutral","tags":["..."]}]${input.lemHint ? ',"quip":"..."' : ''}}`
}

/** Повторный запрос после провала валидации — с текстом ошибки (раздел 6.4) */
export function buildRetryAddendum(errorText: string): string {
  return `\n\nВНИМАНИЕ: предыдущий ответ не прошёл валидацию. Причина: ${errorText}
Верни строго валидный JSON по схеме из предыдущего сообщения, без markdown-обёрток, без пояснений.`
}
