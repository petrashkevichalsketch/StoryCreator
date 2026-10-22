import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, buildUserPrompt } from '@/lib/lem/prompts'
import { generateDemoWave } from '@/lib/lem/providers/demo'

describe('системный промпт (раздел 6.2 ТЗ)', () => {
  it('содержит подставленный размер волны N', () => {
    const p = buildSystemPrompt(7, false)
    expect(p).toContain('предложи 7 вариантов')
    expect(p).toContain('«Калькулятор Лема»')
  })

  it('вне режима Лема правило quip отсутствует, нумерация сквозная', () => {
    const p = buildSystemPrompt(7, false)
    expect(p).not.toContain('quip')
    expect(p).toContain('6. Отвечай по-русски')
    expect(p).toContain('7. Формат ответа')
  })

  it('в режиме Лема добавляется правило quip и нумерация до 8', () => {
    const p = buildSystemPrompt(7, true)
    expect(p).toContain('поле quip')
    expect(p).toContain('блок-схемы Станислава Лема 1973 года')
    expect(p).toContain('8. Формат ответа')
  })
})

describe('пользовательский промпт (раздел 6.3 ТЗ)', () => {
  const path = [
    { level: 1, title: 'Город просыпается без электричества', description: 'Описание 1', consequences: 'Изоляция' },
    { level: 2, title: 'Второй узел', description: 'Описание 2', consequences: '' },
  ]

  it('собирает категорию, посылку, акт, путь и запрет повторов', () => {
    const p = buildUserPrompt({
      category: 'Психологическая проза',
      premise: 'Тихий город',
      level: 3,
      path,
      excludedTitles: ['Вариант А', 'Вариант Б'],
      n: 7,
    })
    expect(p).toContain('Категория романа: Психологическая проза')
    expect(p).toContain('Посылка автора: Тихий город')
    expect(p).toContain('Акт: Завязка — уровень 3 из 12')
    // ранние события — в блоке пути
    expect(p).toContain('1. Город просыпается без электричества')
    expect(p).toContain('последствия, уже заявленные ранее: Изоляция')
    // последний узел пути — отдельный приоритетный блок «основа сюжета»
    expect(p).toContain('ОСНОВА ДАЛЬНЕЙШЕГО СЮЖЕТА — развилка, выбранная автором:')
    expect(p).toContain('2. Второй узел — Описание 2')
    expect(p).toContain('прямые продолжения')
    expect(p).toContain('Вариант А | Вариант Б')
    expect(p).toContain('Предложи 7 развилок')
  })

  it('отредактированный автором узел получает высший приоритет в промпте', () => {
    const p = buildUserPrompt({
      category: 'Психологическая проза',
      level: 3,
      path: [
        ...path,
        {
          level: 3,
          title: 'Розовый слон',
          description: 'Автор переписал событие вручную',
          consequences: '',
          editedByAuthor: true,
        },
      ],
      excludedTitles: [],
      n: 5,
    })
    expect(p).toContain('ЭТО СОБЫТИЕ АВТОР ПЕРЕПИСАЛ ВРУЧНУЮ')
    expect(p).toContain('высший приоритет')
    expect(p).toContain('прежнее направление считается отменённым')
  })

  it('правка автора на раннем узле пути помечается как финальная редакция', () => {
    const p = buildUserPrompt({
      category: 'Психологическая проза',
      level: 3,
      path: [{ ...path[0], editedByAuthor: true }, path[1]],
      excludedTitles: [],
      n: 5,
    })
    expect(p).toContain('(правка автора — финальная редакция события)')
    expect(p).not.toContain('ПЕРЕПИСАЛ ВРУЧНУЮ')
  })

  it('при единственном узле пути блок «Пройденный путь» не выводится', () => {
    const p = buildUserPrompt({ category: 'Хоррор', level: 2, path: [path[0]], excludedTitles: [], n: 5 })
    expect(p).not.toContain('Пройденный путь')
    expect(p).toContain('ОСНОВА ДАЛЬНЕЙШЕГО СЮЖЕТА')
    expect(p).toContain('1. Город просыпается без электричества')
  })

  it('без посылки и запретов пишет «нет»', () => {
    const p = buildUserPrompt({ category: 'Хоррор', level: 1, path: [], excludedTitles: [], n: 5 })
    expect(p).toContain('Посылка автора: нет')
    expect(p).toContain('Не повторяй эти варианты предыдущей волны: нет')
    expect(p).toContain('путь пуст')
  })

  it('уровень выше 12 помечается как углубление эпилога', () => {
    const p = buildUserPrompt({ category: 'Фэнтези', level: 13, path: [], excludedTitles: [], n: 5 })
    expect(p).toContain('уровень 13 (углубление эпилога)')
    expect(p).toContain('Развязка и эпилог')
  })
})

describe('демо-генератор (офлайн-провайдер)', () => {
  const base = {
    category: 'Научная фантастика',
    premise: null,
    act: 'Завязка',
    actFocus: 'введи мир и нарушь равновесие',
    level: 1,
    n: 7,
    lem: false,
    path: [],
    excludedTitles: [] as string[],
  }

  it('возвращает 5-10 различных вариантов с валидными тонами', () => {
    const wave = generateDemoWave(base)
    expect(wave.options.length).toBe(7)
    const titles = new Set(wave.options.map((o) => o.title))
    expect(titles.size).toBe(7)
    for (const o of wave.options) {
      expect(['dark', 'light', 'ironic', 'neutral']).toContain(o.tone)
      expect(o.title.length).toBeGreaterThan(0)
      expect(o.description.length).toBeGreaterThan(0)
      expect(o.consequences.length).toBeGreaterThan(0)
      expect(o.tags.length).toBeLessThanOrEqual(3)
    }
  })

  it('исключает прежние заголовки (FR-4.1)', () => {
    const first = generateDemoWave(base)
    const second = generateDemoWave({ ...base, excludedTitles: first.options.map((o) => o.title) })
    const excluded = new Set(first.options.map((o) => o.title.toLowerCase()))
    for (const o of second.options) {
      expect(excluded.has(o.title.toLowerCase())).toBe(false)
    }
  })

  it('в режиме Лема возвращает ироничную реплику (FR-5.2)', () => {
    const wave = generateDemoWave({ ...base, lem: true })
    expect(wave.quip).toBeTruthy()
    expect((wave.quip as string).split(' ').length).toBeLessThanOrEqual(12)
  })
})
