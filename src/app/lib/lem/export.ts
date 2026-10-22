// Экспорт «романной библии» (FR-8): Markdown, DOCX, файл проекта .lem.json

import { z } from 'zod'
import { BASE_LEVELS } from './acts'
import type { NodeDTO, TreePayload } from './types'

export interface BibleData {
  name: string
  category: string | null
  premise: string | null
  date: string
  provider?: string | null
  model?: string | null
  path: NodeDTO[] // выбранные развилки уровней 1..N
  chain: NodeDTO[] // полный путь от корня (для поиска отвергнутых детей)
  nodes: NodeDTO[] // все узлы проекта
}

export function collectBibleData(payload: TreePayload): BibleData {
  return {
    name: payload.project.name,
    category: payload.project.category,
    premise: payload.project.premise,
    date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    provider: payload.project.provider,
    model: payload.project.model,
    path: payload.path.filter((n) => n.level >= 1),
    chain: payload.path,
    nodes: payload.nodes,
  }
}

function heroConflictNodes(path: NodeDTO[]): NodeDTO[] {
  return path.filter((n) => n.act === 'Герой' || n.act === 'Центральный конфликт')
}

function endingNodes(path: NodeDTO[]): NodeDTO[] {
  return path.filter((n) => n.act === 'Развязка и эпилог' || n.level >= BASE_LEVELS)
}

/** Отвергнутые альтернативы: дети узлов пути без флага is_chosen + неактивные ветки */
export function alternatives(data: BibleData): { level: number; title: string; description: string }[] {
  const onPath = new Set(data.chain.map((n) => n.id))
  const pathById = new Map(data.chain.map((n) => [n.id, n]))
  const result: { level: number; title: string; description: string }[] = []
  for (const n of data.nodes) {
    if (n.level < 1 || onPath.has(n.id)) continue
    const parent = n.parentId ? pathById.get(n.parentId) : undefined
    if (parent) {
      result.push({ level: parent.level + 1, title: n.title, description: n.description })
    }
  }
  return result
}

/* ---------------------------- Markdown ---------------------------- */

export function bibleToMarkdown(data: BibleData): string {
  const L: string[] = []
  L.push(`# ${data.name}`, '')
  L.push(`**Категория:** ${data.category ?? '—'}`)
  L.push('')
  L.push(`**Посылка автора:** ${data.premise?.trim() || '—'}`)
  L.push('')
  L.push(`**Дата:** ${data.date}`)
  if (data.provider) L.push(`**Провайдер:** ${data.provider}${data.model ? ` · ${data.model}` : ''}`)
  L.push('')

  if (!data.path.length) {
    L.push('> Сюжет ещё не начат: путь пуст.')
    return L.join('\n')
  }

  L.push('## Синопсис по уровням', '')
  for (const n of data.path) {
    L.push(`### Уровень ${n.level} · ${n.act} — ${n.title}`)
    L.push('')
    if (n.description) L.push(n.description, '')
    if (n.consequences) L.push(`*Последствия: ${n.consequences}*`, '')
    if (n.quip) L.push(`> «${n.quip}»`, '')
  }

  const hero = heroConflictNodes(data.path)
  if (hero.length) {
    L.push('## Герой и центральный конфликт', '')
    for (const n of hero) {
      L.push(`- **${n.title}** — ${n.description}`)
    }
    L.push('')
  }

  const ending = endingNodes(data.path)
  if (ending.length) {
    L.push('## Концовка', '')
    const last = ending[ending.length - 1]
    L.push(`**${last.title}**`)
    L.push('')
    if (last.description) L.push(last.description, '')
    if (last.consequences) L.push(`*Последствия: ${last.consequences}*`, '')
  }

  const alts = alternatives(data)
  if (alts.length) {
    L.push('## Отвергнутые альтернативы', '')
    for (const a of alts) {
      L.push(`- Уровень ${a.level}: «${a.title}» — ${a.description}`)
    }
    L.push('')
  }
  return L.join('\n')
}

/* ---------------------------- DOCX ---------------------------- */

export async function bibleToDocx(data: BibleData): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = await import('docx')

  const meta = (label: string, value: string) =>
    new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: value || '—' }),
      ],
      spacing: { after: 120 },
    })

  const children: InstanceType<typeof Paragraph>[] = []

  // Титульный блок
  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.name, bold: true, size: 56 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 480 },
    })
  )
  const titleMeta = [
    `Категория: ${data.category ?? '—'}`,
    data.premise?.trim() ? `Посылка автора: ${data.premise.trim()}` : null,
    `Дата: ${data.date}`,
    data.provider ? `Провайдер: ${data.provider}${data.model ? ` · ${data.model}` : ''}` : null,
  ].filter(Boolean) as string[]
  for (const line of titleMeta) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 24, color: '6B7280' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      })
    )
  }
  children.push(new Paragraph({ text: '', pageBreakBefore: true }))

  if (!data.path.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Сюжет ещё не начат: путь пуст.', italics: true })] }))
  } else {
    children.push(new Paragraph({ text: 'Синопсис по уровням', heading: HeadingLevel.HEADING_1 }))
    for (const n of data.path) {
      children.push(new Paragraph({ text: `Уровень ${n.level} · ${n.act} — ${n.title}`, heading: HeadingLevel.HEADING_2 }))
      if (n.description) children.push(new Paragraph({ children: [new TextRun({ text: n.description })], spacing: { after: 120 } }))
      if (n.consequences) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Последствия: ${n.consequences}`, italics: true, size: 20, color: '6B7280' })],
            spacing: { after: 120 },
            border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB', space: 8 } },
          })
        )
      }
      if (n.quip) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: `«${n.quip}»`, italics: true, color: '6B7280' })], spacing: { after: 240 } })
        )
      }
    }

    const hero = heroConflictNodes(data.path)
    if (hero.length) {
      children.push(new Paragraph({ text: 'Герой и центральный конфликт', heading: HeadingLevel.HEADING_1 }))
      for (const n of hero) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: `${n.title}`, bold: true }),
              new TextRun({ text: ` — ${n.description}` }),
            ],
          })
        )
      }
    }

    const ending = endingNodes(data.path)
    if (ending.length) {
      children.push(new Paragraph({ text: 'Концовка', heading: HeadingLevel.HEADING_1 }))
      const last = ending[ending.length - 1]
      children.push(new Paragraph({ text: last.title, heading: HeadingLevel.HEADING_2 }))
      if (last.description) children.push(new Paragraph({ children: [new TextRun({ text: last.description })] }))
      if (last.consequences) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Последствия: ${last.consequences}`, italics: true, size: 20, color: '6B7280' })],
            spacing: { before: 120 },
          })
        )
      }
    }
  }

  const alts = alternatives(data)
  if (alts.length) {
    children.push(new Paragraph({ text: 'Отвергнутые альтернативы', heading: HeadingLevel.HEADING_1 }))
    for (const a of alts) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `Уровень ${a.level}: «${a.title}»`, bold: true }),
            new TextRun({ text: ` — ${a.description}` }),
          ],
        })
      )
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: '1F2937' } },
      },
    },
    sections: [{ children }],
  })

  const buffer = await Packer.toBuffer(doc)
  return new Uint8Array(buffer)
}

/* ---------------------------- .lem.json ---------------------------- */

const lemJsonOption = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable().optional(),
  level: z.number().int().min(0),
  act: z.string().default('Старт'),
  title: z.string().min(1),
  description: z.string().default(''),
  consequences: z.string().default(''),
  tone: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  isChosen: z.boolean().default(false),
  isLem: z.boolean().default(false),
  quip: z.string().nullable().optional(),
  isFinal: z.boolean().default(false),
  generationId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
})

const lemJsonSchema = z.object({
  format: z.literal('lem-calculator-project'),
  version: z.number().int().min(1),
  project: z.object({
    name: z.string().min(1),
    category: z.string().nullable().optional(),
    premise: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
  }),
  settings: z
    .object({
      temperature: z.number().optional(),
      waveSize: z.number().optional(),
    })
    .optional(),
  nodes: z.array(lemJsonOption).min(1),
})

export type LemJsonProject = z.infer<typeof lemJsonSchema>

export function serializeLemJson(payload: TreePayload, generations: { id: string; level: number; provider: string; model: string; status: string; createdAt: Date }[]): unknown {
  return {
    format: 'lem-calculator-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: payload.project.name,
      category: payload.project.category,
      premise: payload.project.premise,
      provider: payload.project.provider,
      model: payload.project.model,
    },
    nodes: payload.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      level: n.level,
      act: n.act,
      title: n.title,
      description: n.description,
      consequences: n.consequences,
      tone: n.tone,
      tags: n.tags,
      isChosen: n.isChosen,
      isLem: n.isLem,
      quip: n.quip,
      isFinal: n.isFinal,
      generationId: n.generationId,
      createdAt: n.createdAt,
    })),
    generations: generations.map((g) => ({
      id: g.id,
      level: g.level,
      provider: g.provider,
      model: g.model,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
    })),
  }
}

export function parseLemJson(raw: unknown): LemJsonProject {
  const parsed = lemJsonSchema.parse(raw)
  // корень (level 0) обязан существовать
  if (!parsed.nodes.some((n) => n.level === 0)) {
    throw new Error('В файле нет корневого узла категории')
  }
  return parsed
}
