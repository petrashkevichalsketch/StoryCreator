// Структура сюжета: 12 уровней, сгруппированных в шесть актов (FR-3)

export interface ActDef {
  name: string
  from: number
  to: number
  focus: string
}

export const BASE_LEVELS = 12

export const ACTS: ActDef[] = [
  { name: 'Завязка', from: 1, to: 3, focus: 'введи мир и нарушь равновесие' },
  { name: 'Герой', from: 4, to: 5, focus: 'определи героя, его желание и ложную цель' },
  { name: 'Центральный конфликт', from: 6, to: 7, focus: 'сформулируй центральный конфликт и его цену' },
  { name: 'Осложнения', from: 8, to: 10, focus: 'наращивай ставки: предательства, открытия, ложные победы' },
  { name: 'Кульминация', from: 11, to: 11, focus: 'толкни историю к развязке' },
  { name: 'Развязка и эпилог', from: BASE_LEVELS, to: Number.MAX_SAFE_INTEGER, focus: 'заверши историю и дай эпилог' },
]

export function actForLevel(level: number): ActDef {
  const found = ACTS.find((a) => level >= a.from && level <= a.to)
  if (found) return found
  return level < 1 ? ACTS[0] : ACTS[ACTS.length - 1]
}

/** FR-3.2: счётчик вида «Уровень 7 из 12» */
export function levelCounter(level: number): string {
  if (level <= BASE_LEVELS) return `Уровень ${level} из ${BASE_LEVELS}`
  return `Уровень ${level} · углубление эпилога`
}
