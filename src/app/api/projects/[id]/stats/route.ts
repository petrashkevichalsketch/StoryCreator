import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { jsonError } from '@/lib/lem/api'

/** Прозрачность расходов: токены и оценка стоимости по разделу 6.5 ТЗ */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const project = await db.project.findUnique({ where: { id } })
  if (!project) return jsonError('Проект не найден', 404)

  const gens = await db.generation.findMany({ where: { projectId: id } })
  const tokensIn = gens.reduce((s, g) => s + g.tokensIn, 0)
  const tokensOut = gens.reduce((s, g) => s + g.tokensOut, 0)
  const costUsd = gens.reduce((s, g) => s + g.costUsd, 0)
  const failed = gens.filter((g) => g.status !== 'ok').length

  return NextResponse.json({
    generations: gens.length,
    tokensIn,
    tokensOut,
    costUsd: Math.round(costUsd * 1000) / 1000,
    failed,
  })
}
