import { describe, expect, it } from 'vitest'
import { actForLevel, levelCounter, BASE_LEVELS } from '@/lib/lem/acts'

describe('структура сюжета (FR-3)', () => {
  it('раскладывает 12 уровней по шести актам', () => {
    expect(actForLevel(1).name).toBe('Завязка')
    expect(actForLevel(3).name).toBe('Завязка')
    expect(actForLevel(4).name).toBe('Герой')
    expect(actForLevel(5).name).toBe('Герой')
    expect(actForLevel(6).name).toBe('Центральный конфликт')
    expect(actForLevel(7).name).toBe('Центральный конфликт')
    expect(actForLevel(8).name).toBe('Осложнения')
    expect(actForLevel(10).name).toBe('Осложнения')
    expect(actForLevel(11).name).toBe('Кульминация')
    expect(actForLevel(12).name).toBe('Развязка и эпилог')
  })

  it('уровни после 12 остаются в акте «Развязка и эпилог» (FR-3.3)', () => {
    expect(actForLevel(13).name).toBe('Развязка и эпилог')
    expect(actForLevel(40).name).toBe('Развязка и эпилог')
  })

  it('счётчик уровня показывает «N из 12», выше — углубление', () => {
    expect(levelCounter(7)).toBe(`Уровень 7 из ${BASE_LEVELS}`)
    expect(levelCounter(12)).toBe(`Уровень 12 из ${BASE_LEVELS}`)
    expect(levelCounter(13)).toContain('углубление')
  })

  it('задачи уровней (act_focus) заполнены для каждого акта', () => {
    for (let level = 1; level <= 13; level++) {
      expect(actForLevel(level).focus.length).toBeGreaterThan(10)
    }
  })
})
