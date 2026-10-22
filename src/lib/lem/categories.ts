// Восемь предустановленных категорий романа (FR-1.1)

export interface CategoryDef {
  code: string
  name: string
  hue: string // цвет монограммы
}

export const CATEGORIES: CategoryDef[] = [
  { code: 'scifi', name: 'Научная фантастика', hue: '#1A56DB' },
  { code: 'fantasy', name: 'Фэнтези', hue: '#7C3AED' },
  { code: 'detective', name: 'Детектив и триллер', hue: '#B45309' },
  { code: 'horror', name: 'Хоррор', hue: '#DC2626' },
  { code: 'melodrama', name: 'Мелодрама', hue: '#DB2777' },
  { code: 'historical', name: 'Исторический роман', hue: '#A16207' },
  { code: 'adventure', name: 'Приключения', hue: '#059669' },
  { code: 'psych', name: 'Психологическая проза', hue: '#475569' },
]

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name)

export function categoryColor(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.hue ?? '#6B7280'
}

export function categoryMonogram(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
