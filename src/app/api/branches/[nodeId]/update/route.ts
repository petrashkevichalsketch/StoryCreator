import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProjectPayload } from '@/lib/lem/tree'
import { jsonError } from '@/lib/lem/api'
import { sanitizeVariantPatch } from '@/lib/lem/validator'

/**
 * Ручная правка варианта развития события (окно «Редактировать»).
 * Разрешено менять title, description, consequences и tone у любого узла,
 * кроме корневого (корень — категория проекта). Правка не влияет на
 * структуру дерева: isChosen/isFinal/parentId менять нельзя.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await ctx.params
  const body: unknown = await req.json().catch(() => null)

  const node = await db.plotNode.findUnique({ where: { id: nodeId } })
  if (!node) return jsonError('Узел не найден', 404)
  if (node.level === 0) return jsonError('Корневой узел (категория) редактировать нельзя', 400)

  const sanitized = sanitizeVariantPatch(body)
  if ('error' in sanitized) return jsonError(sanitized.error, 400)

  try {
    // editedByAuthor: правка автора получает высший приоритет в промпте
    // следующей волны — отредактированный текст становится основой сюжета
    await db.plotNode.update({ where: { id: nodeId }, data: { ...sanitized.data, editedByAuthor: true } })
  } catch {
    return jsonError('Не удалось сохранить правку варианта', 500)
  }

  const payload = await getProjectPayload(node.projectId)
  return NextResponse.json(payload)
}
