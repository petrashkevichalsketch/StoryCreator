'use client'

import { cn } from '@/lib/utils'
import type { NodeDTO } from '@/lib/lem/types'
import { ToneBadge } from './ui-bits'

interface ForkCardProps {
  node: NodeDTO
  state: 'normal' | 'selected' | 'rejected' | 'history'
  onSelect?: (node: NodeDTO) => void
  disabled?: boolean
}

/**
 * Карточка развилки: пять обязательных состояний (раздел 5.3 ТЗ) —
 * обычная, при наведении, выбранная, отклонённая, скелетон (см. SkeletonCard).
 * Заголовок 16px/600, описание 14px, последствия — мелкий серый 12px.
 */
export function ForkCard({ node, state, onSelect, disabled }: ForkCardProps) {
  const clickable = !!onSelect && !disabled
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onSelect(node)}
      className={cn(
        'group w-full rounded-lg border bg-card p-4 text-left transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        state === 'normal' &&
          clickable &&
          'border-border hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(26,86,219,0.10)] cursor-pointer',
        state === 'normal' && !clickable && 'border-border opacity-80',
        state === 'selected' && 'border-primary bg-primary/[0.08]',
        state === 'rejected' && 'border-border bg-muted/70 opacity-55 cursor-default',
        state === 'history' && 'border-border bg-card hover:border-primary/50 hover:-translate-y-0.5 cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[16px] font-semibold leading-snug text-card-foreground">{node.title}</h3>
        {state === 'selected' && (
          <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-primary px-2 text-[11px] font-medium text-primary-foreground">
            выбрано
          </span>
        )}
      </div>
      {node.description && <p className="mt-1.5 text-[14px] leading-relaxed text-card-foreground/90">{node.description}</p>}
      {node.consequences && (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">→ {node.consequences}</p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <ToneBadge tone={node.tone} />
        {node.tags.map((t) => (
          <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] leading-none text-muted-foreground">
            {t}
          </span>
        ))}
        {node.isLem && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] leading-none text-amber-700">
            режим Лема
          </span>
        )}
      </div>
      {node.quip && (
        <p className="mt-2 border-l-2 border-amber-200 pl-2 text-[12px] italic leading-snug text-muted-foreground">«{node.quip}»</p>
      )}
    </button>
  )
}

export function SkeletonCard() {
  return (
    <div className="w-full animate-pulse rounded-lg border border-border bg-muted/60 p-4" aria-hidden>
      <div className="h-4 w-2/3 rounded bg-muted-foreground/15" />
      <div className="mt-2.5 h-3 w-full rounded bg-muted-foreground/10" />
      <div className="mt-1.5 h-3 w-5/6 rounded bg-muted-foreground/10" />
      <div className="mt-2.5 h-2.5 w-3/4 rounded bg-muted-foreground/10" />
    </div>
  )
}
