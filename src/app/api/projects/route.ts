import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/lem/settings'
import { providerMeta } from '@/lib/lem/providers/meta'
import type { ProjectListItem } from '@/lib/lem/types'

export async function GET() {
  const projects = await db.project.findMany({ orderBy: { updatedAt: 'desc' } })
  const items: ProjectListItem[] = []
  for (const p of projects) {
    const node = p.currentNodeId ? await db.plotNode.findUnique({ where: { id: p.currentNodeId } }) : null
    items.push({
      id: p.id,
      name: p.name,
      category: p.category,
      premise: p.premise,
      provider: p.provider,
      model: p.model,
      updatedAt: p.updatedAt.toISOString(),
      level: node?.level ?? 0,
      isFinal: node?.isFinal ?? false,
    })
  }
  return NextResponse.json({ projects: items })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Укажите название сюжета' }, { status: 400 })
  const premise = typeof body?.premise === 'string' ? body.premise.trim().slice(0, 400) : ''

  // За проектом закрепляются провайдер и модель, которыми он строился (FR-9.5)
  const settings = await getSettings()
  const meta = providerMeta(settings.provider)
  const model = settings.model || meta?.defaultModel || ''

  const project = await db.project.create({
    data: {
      id: randomUUID(),
      name: name.slice(0, 120),
      premise: premise || null,
      provider: settings.provider,
      model,
    },
  })
  return NextResponse.json({ id: project.id })
}
