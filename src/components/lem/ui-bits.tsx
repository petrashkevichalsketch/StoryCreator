'use client'

import { categoryColor, categoryMonogram } from '@/lib/lem/categories'
import { TONE_LABELS, type Tone } from '@/lib/lem/types'
import { cn } from '@/lib/utils'

export function ToneBadge({ tone, className }: { tone: Tone | null; className?: string }) {
  if (!tone) return null
  const styles: Record<Tone, string> = {
    dark: 'bg-gray-100 text-gray-600 border-gray-200',
    light: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    ironic: 'bg-amber-50 text-amber-700 border-amber-100',
    neutral: 'bg-blue-50 text-blue-700 border-blue-100',
  }
  const dots: Record<Tone, string> = {
    dark: 'bg-gray-500',
    light: 'bg-emerald-500',
    ironic: 'bg-amber-500',
    neutral: 'bg-blue-500',
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-none', styles[tone], className)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} />
      {TONE_LABELS[tone]}
    </span>
  )
}

export function CategoryChip({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const hue = categoryColor(name)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center justify-center rounded font-semibold text-white"
        style={{ backgroundColor: hue, width: size === 'md' ? 26 : 18, height: size === 'md' ? 26 : 18, fontSize: size === 'md' ? 11 : 8 }}
      >
        {categoryMonogram(name)}
      </span>
      <span className={cn('font-medium', size === 'md' ? 'text-sm' : 'text-xs')}>{name}</span>
    </span>
  )
}

export function EndMark({ className }: { className?: string }) {
  return <span className={cn('text-[12px] font-medium text-muted-foreground', className)}>(конец)</span>
}
