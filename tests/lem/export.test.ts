import { describe, expect, it } from 'vitest'
import { bibleToMarkdown, collectBibleData, alternatives } from '@/lib/lem/export'
import type { TreePayload, NodeDTO } from '@/lib/lem/types'
import { actForLevel } from '@/lib/lem/acts'

function node(partial: Partial<NodeDTO> & { id: string; level: number; title: string }): NodeDTO {
  return {
    parentId: null,
    act: 'Завязка',
    description: '',
    consequences: '',
    tone: null,
    tags: [],
    isChosen: false,
    isLem: false,
    editedByAuthor: false,
    quip: null,
    isFinal: false,
    generationId: null,
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

/** Консистентное дерево: путь из 12 уровней + одна отвергнутая альтернатива на уровне 1 */
function makePayload(): TreePayload {
  const root = node({ id: 'root', level: 0, title: 'Хоррор', isChosen: true, act: 'Старт' })
  const nodes: NodeDTO[] = [root]
  const path: NodeDTO[] = [root]
  let parentId: string | null = 'root'
  for (let level = 1; level <= 12; level++) {
    const n = node({
      id: `l${level}`,
      parentId,
      level,
      act: actForLevel(level).name,
      title: level === 1 ? 'Дом у болота' : level === 12 ? 'Возвращение на болото' : `Узел уровня ${level}`,
      description: `Описание ${level}.`,
      consequences: level === 1 ? 'Соседи молчат о прошлом.' : `Последствие ${level}.`,
      isChosen: true,
      quip: level === 12 ? 'Лем бы одобрил.' : null,
      isFinal: level === 12,
    })
    nodes.push(n)
    path.push(n)
    parentId = n.id
  }
  const alt = node({ id: 'l1a', parentId: 'root', level: 1, act: 'Завязка', title: 'Квартира в центре', description: 'Другое начало.' })
  nodes.push(alt)
  const currentNode = nodes.find((n) => n.id === 'l12')!
  return {
    project: {
      id: 'p1',
      name: 'Болото',
      category: 'Хоррор',
      premise: 'Дом против семьи',
      provider: 'demo',
      model: 'demo-templates',
      currentNodeId: 'l12',
      updatedAt: new Date().toISOString(),
    },
    nodes,
    activePathIds: path.map((n) => n.id),
    path,
    currentNode,
  }
}

describe('романная библия (FR-8)', () => {
  it('markdown содержит титул, синопсис с последствиями, концовку и альтернативы', () => {
    const data = collectBibleData(makePayload())
    const md = bibleToMarkdown(data)
    expect(md).toContain('# Болото')
    expect(md).toContain('**Категория:** Хоррор')
    expect(md).toContain('**Посылка автора:** Дом против семьи')
    expect(md).toContain('### Уровень 1 · Завязка — Дом у болота')
    expect(md).toContain('*Последствия: Соседи молчат о прошлом.*')
    expect(md).toContain('## Концовка')
    expect(md).toContain('Возвращение на болото')
    expect(md).toContain('## Отвергнутые альтернативы')
    expect(md).toContain('«Квартира в центре»')
    expect(md).toContain('«Лем бы одобрил.»')
  })

  it('сводка героя включает узлы акта «Герой» (уровни 4-5)', () => {
    const data = collectBibleData(makePayload())
    const md = bibleToMarkdown(data)
    expect(md).toContain('## Герой и центральный конфликт')
    expect(md).toContain('Узел уровня 4')
    expect(md).toContain('Узел уровня 5')
    // кульминация не попадает в сводку героя
    expect(md.split('## Герой и центральный конфликт')[1].split('## Концовка')[0]).not.toContain('Узел уровня 11')
  })

  it('alternatives считает только отвергнутых детей узлов пути', () => {
    const data = collectBibleData(makePayload())
    const alts = alternatives(data)
    expect(alts.length).toBe(1)
    expect(alts[0].title).toBe('Квартира в центре')
    expect(alts[0].level).toBe(1)
  })

  it('пустой путь даёт пометку «сюжет ещё не начат»', () => {
    const payload = makePayload()
    payload.path = []
    payload.currentNode = null
    payload.project.currentNodeId = null
    const md = bibleToMarkdown(collectBibleData(payload))
    expect(md).toContain('Сюжет ещё не начат')
  })
})
