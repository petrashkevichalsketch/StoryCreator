// Промпты «Калькулятора Лема» — эталонные тексты из разделов 6.2–6.3 ТЗ.
// Правки текста допускаются только по согласованию с заказчиком.

import { actForLevel } from './acts'

export interface PathItem {
  level: number
  title: string
  description: string
  consequences: string
  /** событие переписано автором вручную — помечается в промпте как финальная редакция */
  editedByAuthor?: boolean
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

  const formatItem = (p: PathItem) =>
    `${p.level}. ${p.title} — ${p.description}${p.consequences ? `; последствия, уже заявленные ранее: ${p.consequences}` : ''}`

  // Последний элемент пути — развилка, из которой растёт следующая волна.
  // Она выносится в отдельный приоритетный блок: отредактированный автором
  // текст становится основой дальнейшего сюжета (требование заказчика).
  const earlier = input.path.slice(0, -1)
  const last = input.path[input.path.length - 1]

  const earlierLines = earlier
    .map((p) => `${formatItem(p)}${p.editedByAuthor ? ' (правка автора — финальная редакция события)' : ''}`)
    .join('\n')

  const lastBlock = last
    ? [
        'ОСНОВА ДАЛЬНЕЙШЕГО СЮЖЕТА — развилка, выбранная автором:',
        formatItem(last),
        last.editedByAuthor
          ? 'ЭТО СОБЫТИЕ АВТОР ПЕРЕПИСАЛ ВРУЧНУЮ, его текст — финальная редакция. Развивай сюжет строго из этой версии: она имеет высший приоритет, и если ранний путь или посылка автора расходятся с ней — следуй развилке, а прежнее направление считается отменённым.'
          : 'Развивай сюжет именно из этого события: все варианты ниже — его прямые продолжения.',
      ].join('\n')
    : ''

  const pathSection = input.path.length
    ? [earlier.length ? `Пройденный путь (не противоречь ему):\n${earlierLines}` : '', lastBlock].filter(Boolean).join('\n\n')
    : '(путь пуст — это первая волна)'

  const excluded = input.excludedTitles.length ? input.excludedTitles.join(' | ') : 'нет'

  return `Категория романа: ${input.category}
Посылка автора: ${input.premise?.trim() || 'нет'}
${levelLine}
Задача уровня: ${act.focus}

${pathSection}

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
