'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { NodeDTO } from '@/lib/lem/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLemStore } from '@/lib/store'
import { Maximize2 } from 'lucide-react'

const NODE_W = 168
const NODE_H = 46
const GAP_X = 20
const ROW_H = 78

interface Layout {
  pos: Map<string, { x: number; y: number }>
  width: number
  height: number
}

/** Вертикальная мини-схема: уровни — строками, братья — рядом (FR-6) */
function layoutTree(nodes: NodeDTO[]): Layout {
  const childrenMap = new Map<string | null, NodeDTO[]>()
  for (const n of nodes) {
    const arr = childrenMap.get(n.parentId) ?? []
    arr.push(n)
    childrenMap.set(n.parentId, arr)
  }
  for (const arr of childrenMap.values()) {
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title))
  }
  const pos = new Map<string, { x: number; y: number }>()
  let cursor = 0
  let maxLevel = 0

  function place(n: NodeDTO): number {
    maxLevel = Math.max(maxLevel, n.level)
    const kids = childrenMap.get(n.id) ?? []
    let cx: number
    if (!kids.length) {
      cx = cursor * (NODE_W + GAP_X) + NODE_W / 2
      cursor += 1
    } else {
      const centers = kids.map(place)
      cx = (Math.min(...centers) + Math.max(...centers)) / 2
    }
    pos.set(n.id, { x: cx, y: n.level * ROW_H })
    return cx
  }
  for (const root of childrenMap.get(null) ?? []) place(root)

  return {
    pos,
    width: Math.max(cursor * (NODE_W + GAP_X), NODE_W + GAP_X),
    height: (maxLevel + 1) * ROW_H,
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function TreeMapContent({
  nodes,
  activePathIds,
  onReturn,
  compact,
  currentNodeId,
  scrollerId,
}: {
  nodes: NodeDTO[]
  activePathIds: Set<string>
  onReturn: (id: string) => void
  compact?: boolean
  currentNodeId?: string | null
  scrollerId?: string
}) {
  const { pos, width, height } = useMemo(() => layoutTree(nodes), [nodes])

  // при открытии карта прокручивается к текущему узлу пути (панель и полный экран)
  useEffect(() => {
    if (!currentNodeId) return
    const t = setTimeout(() => {
      const scroller = document.getElementById(scrollerId ?? 'tree-map-scroller')
      const target = pos.get(currentNodeId)
      if (scroller && target) {
        scroller.scrollTo({
          left: Math.max(0, target.x - scroller.clientWidth / 2),
          top: Math.max(0, target.y - 60),
          behavior: 'smooth',
        })
      }
    }, 350)
    return () => clearTimeout(t)
  }, [currentNodeId, pos, scrollerId])

  if (!nodes.length) {
    return <p className="p-4 text-center text-sm text-muted-foreground">Дерево пока пусто</p>
  }

  const lines: React.ReactNode[] = []
  for (const n of nodes) {
    if (!n.parentId) continue
    const p = pos.get(n.id)
    const pp = pos.get(n.parentId)
    if (!p || !pp) continue
    const active = activePathIds.has(n.id) && activePathIds.has(n.parentId)
    const midY = pp.y + NODE_H + (p.y - pp.y - NODE_H) / 2
    lines.push(
      <path
        key={`e-${n.id}`}
        d={`M ${pp.x} ${pp.y + NODE_H} V ${midY} H ${p.x} V ${p.y}`}
        fill="none"
        stroke={active ? '#1A56DB' : '#E5E7EB'}
        strokeWidth={active ? 2 : 1.2}
      />
    )
  }

  const rects = nodes.map((n) => {
    const p = pos.get(n.id)
    if (!p) return null
    const onPath = activePathIds.has(n.id)
    const isRoot = n.level === 0
    const fill = onPath ? '#1A56DB' : isRoot ? '#EFF6FF' : '#FFFFFF'
    const stroke = onPath ? '#1A56DB' : isRoot ? '#1A56DB' : '#E5E7EB'
    const textColor = onPath ? '#FFFFFF' : isRoot ? '#1A56DB' : '#6B7280'
    return (
      <g
        key={n.id}
        data-node-id={n.id}
        transform={`translate(${p.x - NODE_W / 2}, ${p.y})`}
        onClick={() => onReturn(n.id)}
        className="cursor-pointer"
        role="button"
        aria-label={`Уровень ${n.level}: ${n.title}`}
      >
        <rect
          width={NODE_W}
          height={NODE_H}
          rx={8}
          fill={fill}
          stroke={stroke}
          strokeWidth={isRoot ? 1.5 : 1}
          strokeDasharray={isRoot ? '4 3' : undefined}
        />
        <text
          x={NODE_W / 2}
          y={n.isFinal ? 19 : 26}
          textAnchor="middle"
          fontSize={11}
          fontWeight={onPath ? 600 : 500}
          fill={textColor}
        >
          {truncate(n.title, 24)}
        </text>
        <text x={NODE_W / 2} y={n.isFinal ? 34 : 38} textAnchor="middle" fontSize={9.5} fill={onPath ? '#DBEAFE' : '#9CA3AF'}>
          {n.level === 0 ? 'старт' : n.isFinal ? `${n.act} · (конец)` : `ур. ${n.level} · ${truncate(n.act, 16)}`}
        </text>
      </g>
    )
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Карта-дерево сюжета"
      style={{ width: Math.max(width, 400), height: 'auto' }}
      preserveAspectRatio="xMidYMin meet"
    >
      {lines}
      {rects}
    </svg>
  )
}

/** Боковая сворачиваемая панель + полный экран (FR-6.4) */
export function TreeMapDialog() {
  const payload = useLemStore((s) => s.payload)
  const mapFull = useLemStore((s) => s.mapFull)
  const setMapFull = useLemStore((s) => s.setMapFull)
  const returnToNode = useLemStore((s) => s.returnToNode)
  if (!payload) return null
  const activePath = new Set(payload.activePathIds)
  return (
    <Dialog open={mapFull} onOpenChange={setMapFull}>
      <DialogContent className="h-[92vh] max-w-[95vw] sm:h-[92vh] sm:max-w-[1100px]">
        <DialogHeader className="px-1 pt-1">
          <DialogTitle className="flex items-center justify-between text-[16px]">
            Карта-дерево · {payload.project.name}
            <Button variant="outline" size="sm" onClick={() => setMapFull(false)}>
              Свернуть
            </Button>
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Схема масштабируется под глубину дерева; щелчок по узлу возвращает к уровню.
          </DialogDescription>
        </DialogHeader>
        <div id="tree-map-full-scroller" className="lem-scroll min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/30 p-3">
          <TreeMapContent
            nodes={payload.nodes}
            activePathIds={activePath}
            currentNodeId={payload.currentNode?.id ?? null}
            scrollerId="tree-map-full-scroller"
            onReturn={(id) => {
              void returnToNode(id)
              setMapFull(false)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MapFullscreenButton() {
  const setMapFull = useLemStore((s) => s.setMapFull)
  return (
    <Button variant="outline" size="sm" className="w-full" onClick={() => setMapFull(true)}>
      <Maximize2 className="mr-2 h-4 w-4" />
      Развернуть карту
    </Button>
  )
}
