import { describe, expect, it } from 'vitest'
import { validateWave, extractJson, normalizeWave } from '@/lib/lem/validator'

function makeOption(i: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: `Вариант ${i}: развилка судьбы`,
    description: `Описание события номер ${i} в одну-две фразы.`,
    consequences: `Последствие ${i}: к чему это приведёт позже.`,
    tone: (['dark', 'light', 'ironic', 'neutral', 'dark', 'light', 'ironic'][i % 7]) as string,
    tags: ['тег'],
    ...overrides,
  }
}

function makeRaw(n = 7, overrides: Record<string, unknown> = {}) {
  const optionOverride = overrides.option as ((i: number) => Partial<Record<string, unknown>>) | undefined
  return JSON.stringify({
    act: 'Завязка',
    level: 1,
    options: Array.from({ length: n }, (_, i) => makeOption(i, typeof optionOverride === 'function' ? optionOverride(i) : undefined)),
    ...overridesExcept(overrides),
  })
}

function overridesExcept(overrides: Record<string, unknown>) {
  const { option: _o, ...rest } = overrides
  return rest
}

describe('контракт ответа модели (раздел 6.4)', () => {
  it('валидная волна из 5-10 вариантов проходит', () => {
    for (const n of [5, 7, 10]) {
      const result = validateWave(makeRaw(n), 'Завязка')
      expect(result.ok).toBe(true)
      expect(result.wave?.options.length).toBe(n)
    }
  })

  it('меньше 5 вариантов не проходит валидацию', () => {
    const result = validateWave(makeRaw(4), 'Завязка')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('от 5 до 10')
  })

  it('больше 10 вариантов обрезается до 10', () => {
    const result = validateWave(makeRaw(12), 'Завязка')
    expect(result.ok).toBe(true)
    expect(result.wave?.options.length).toBe(10)
  })

  it('несовпадение акта отвергается', () => {
    const result = validateWave(makeRaw(7), 'Кульминация')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('act')
  })

  it('пустые description и consequences не проходят', () => {
    const raw = makeRaw(5, { option: (i: number) => (i === 2 ? { consequences: '' } : {}) })
    const result = validateWave(raw, 'Завязка')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('consequences')
  })

  it('tone нормализует регистр и русские синонимы до валидации', () => {
    const raw = makeRaw(5, { option: (i: number) => ({ tone: ['МРАЧНО', 'Светло', ' Иронично ', 'НЕЙТРАЛЬНО', 'dark'][i] }) })
    const result = validateWave(raw, 'Завязка')
    expect(result.ok).toBe(true)
    expect(result.wave?.options.map((o) => o.tone)).toEqual(['dark', 'light', 'ironic', 'neutral', 'dark'])
  })

  it('неизвестный tone отвергается с понятной ошибкой', () => {
    const raw = makeRaw(5, { option: (i: number) => (i === 0 ? { tone: 'tragically' } : {}) })
    const result = validateWave(raw, 'Завязка')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('tone')
  })

  it('tags обрезаются до трёх', () => {
    const raw = makeRaw(5, { option: () => ({ tags: ['a', 'b', 'c', 'd', 'e'] }) })
    const result = validateWave(raw, 'Завязка')
    expect(result.ok).toBe(true)
    expect(result.wave?.options[0].tags.length).toBe(3)
  })

  it('title длиннее 80 символов усекается', () => {
    const long = 'С'.repeat(120)
    const raw = makeRaw(5, { option: () => ({ title: long }) })
    const result = validateWave(raw, 'Завязка')
    expect(result.ok).toBe(true)
    expect(result.wave?.options[0].title.length).toBeLessThanOrEqual(80)
  })

  it('поле quip сохраняется в режиме Лема', () => {
    const raw = JSON.stringify({
      act: 'Завязка',
      options: Array.from({ length: 5 }, (_, i) => makeOption(i)),
      quip: 'И все погибли, но график сдан в срок.',
    })
    const result = validateWave(raw, 'Завязка')
    expect(result.ok).toBe(true)
    expect(result.wave?.quip).toContain('график')
  })
})

describe('извлечение JSON (extractJson)', () => {
  it('срезает markdown-ограждения ```json', () => {
    const raw = '```json\n' + makeRaw(5) + '\n```'
    const data = extractJson(raw) as { act: string }
    expect(data.act).toBe('Завязка')
  })

  it('терпит пояснительный текст вокруг JSON', () => {
    const raw = 'Вот варианты:\n' + makeRaw(5) + '\nНадеюсь, поможет!'
    const data = extractJson(raw) as { act: string }
    expect(data.act).toBe('Завязка')
  })

  it('ремонтирует незакрытую кавычку ключа (наблюдаемый сбой модели)', () => {
    const broken = '{"act":"Завязка","options":[{"title":"Т","description":"Д","consequences":"П","tone":"dark","tags:["а","б"]}],"quip":"x"}'
    const data = extractJson(broken) as { act: string }
    expect(data.act).toBe('Завязка')
  })

  it('ремонтирует висячую запятую', () => {
    const broken = '{"act":"Завязка","options":[],"level":1,}'
    const data = extractJson(broken) as { level: number }
    expect(data.level).toBe(1)
  })
})

describe('normalizeWave защищается от мусора', () => {
  it('не-JSON объект отвергается с ошибкой', () => {
    expect(normalizeWave('строка')).toHaveProperty('error')
    expect(normalizeWave([1, 2, 3])).toHaveProperty('error')
  })
})
