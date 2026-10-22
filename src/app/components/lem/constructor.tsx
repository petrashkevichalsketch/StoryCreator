'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useLemStore } from '@/lib/store'
import { actForLevel, levelCounter, BASE_LEVELS } from '@/lib/lem/acts'
import { CATEGORIES } from '@/lib/lem/categories'
import type { NodeDTO } from '@/lib/lem/types'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ForkCard, SkeletonCard } from './fork-card'
import { MapFullscreenButton, TreeMapContent, TreeMapDialog } from './tree-map'
import { ExportDialog } from './export-dialog'
import { CategoryChip, EndMark } from './ui-bits'
import { BookOpen, Flag, Map as MapIcon, Play, Square, Waves } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ----------------------------- Шапка ----------------------------- */

function Header() {
  const payload = useLemStore((s) => s.payload)
  const lemRunning = useLemStore((s) => s.lemRunning)
  const lemStart = useLemStore((s) => s.lemStart)
  const lemStop = useLemStore((s) => s.lemStop)
  const setScreen = useLemStore((s) => s.setScreen)
  const setMapOpen = useLemStore((s) => s.setMapOpen)
  const setExportOpen = useLemStore((s) => s.setExportOpen)
  if (!payload) return null

  const cur = payload.currentNode
  const nextLevel = cur ? cur.level + 1 : 1
  const status = !payload.project.category
    ? 'Выберите категорию'
    : cur?.isFinal
      ? `${levelCounter(cur.level)} · (конец)`
      : `${levelCounter(Math.min(nextLevel, BASE_LEVELS))} · ${actForLevel(nextLevel).name}`

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-secondary/95 backdrop-blur supports-[backdrop-filter]:bg-secondary/80">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-2 px-4 sm:gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 shrink-0" onClick={() => setScreen('library')}>
          ← <span className="hidden sm:inline">Проекты</span>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{payload.project.name}</div>
          <div className="flex items-center gap-1.5 truncate text-[12px] leading-tight text-muted-foreground">
            {payload.project.category ? <CategoryChip name={payload.project.category} /> : <span>Категория не выбрана</span>}
            <span aria-hidden>·</span>
            <span className="truncate">{status}</span>
          </div>
        </div>
        {lemRunning ? (
          <Button size="sm" variant="destructive" onClick={lemStop}>
            <Square className="mr-1.5 h-3.5 w-3.5" />
            Стоп
            <span className="ml-2 h-2 w-2 animate-ping rounded-full bg-white/80" aria-hidden />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={lemStart}
            disabled={!payload.project.category || !!cur?.isFinal}
            title="Автоматическое случайное прохождение с ироничными репликами"
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Режим Лема
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setMapOpen(true)} title="Карта-дерево">
          <MapIcon className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Карта</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setExportOpen(true)} title="Экспорт романной библии">
          <BookOpen className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Экспорт</span>
        </Button>
      </div>
    </header>
  )
}

/* --------------------- Лента категорий (FR-1) --------------------- */

function CategoryRibbon() {
  const chooseCategory = useLemStore((s) => s.chooseCategory)
  const busy = useLemStore((s) => s.busy)
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-4xl px-4 py-3">
        <p className="mb-2 text-[12px] text-muted-foreground">
          Выберите категорию романа — она закрепится в шапке на весь проект
        </p>
        <div className="lem-scroll flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={busy}
              onClick={() => void chooseCategory(c.name)}
              className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[13px] font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white" style={{ backgroundColor: c.hue }}>
                {c.name.split(/[\s-]+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------- Лента пути (FR-2.5) ------------------- */

function PathRibbon() {
  const payload = useLemStore((s) => s.payload)
  const returnToNode = useLemStore((s) => s.returnToNode)
  if (!payload || !payload.project.category) return null
  const { path, currentNode } = payload
  return (
    <nav aria-label="Пройденный путь" className="border-b border-border bg-background">
      <div className="lem-scroll mx-auto flex w-full max-w-4xl items-center gap-1.5 overflow-x-auto px-4 py-2 text-[12px]">
        {path.map((n, i) => (
          <span key={n.id} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/50">→</span>}
            <button
              type="button"
              disabled={n.id === currentNode?.id}
              onClick={() => void returnToNode(n.id)}
              title={n.id === currentNode?.id ? 'Текущий узел' : `Вернуться к уровню ${n.level}: ${n.title}`}
              className={cn(
                'max-w-[180px] truncate rounded-full border px-2.5 py-1 transition-colors duration-200',
                n.id === currentNode?.id
                  ? 'border-primary bg-primary font-medium text-primary-foreground'
                  : 'border-border bg-secondary text-muted-foreground hover:border-primary/50 hover:text-primary'
              )}
            >
              {n.level === 0 ? 'Старт' : `${n.level}. ${n.title}`}
            </button>
          </span>
        ))}
        {currentNode?.isFinal && (
          <span className="ml-1 shrink-0">
            <EndMark className="font-semibold text-primary" />
          </span>
        )}
      </div>
    </nav>
  )
}

/* ------------------- Выбранные узлы пути ------------------- */

function PathHistory() {
  const payload = useLemStore((s) => s.payload)
  const returnToNode = useLemStore((s) => s.returnToNode)
  if (!payload) return null
  const history = payload.path.filter((n) => n.level >= 1)
  if (!history.length) return null
  return (
    <div className="space-y-3">
      {history.map((n) => (
        <div
          key={n.id}
          role={n.id === payload.currentNode?.id ? undefined : 'button'}
          tabIndex={n.id === payload.currentNode?.id ? undefined : 0}
          onClick={n.id === payload.currentNode?.id ? undefined : () => void returnToNode(n.id)}
          onKeyDown={
            n.id === payload.currentNode?.id
              ? undefined
              : (e) => e.key === 'Enter' && void returnToNode(n.id)
          }
          className={cn(
            'group rounded-lg border p-4 transition-all duration-200',
            n.id === payload.currentNode?.id
              ? 'border-primary bg-primary/[0.06]'
              : 'cursor-pointer border-border bg-card hover:border-primary/50 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Уровень {n.level} · {n.act}
            </span>
            {n.id === payload.currentNode?.id ? (
              n.isFinal ? <EndMark className="font-semibold text-primary" /> : null
            ) : (
              <span className="text-[11px] text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100">
                вернуться ↓
              </span>
            )}
          </div>
          <h3 className="mt-1 text-[16px] font-semibold leading-snug">{n.title}</h3>
          {n.description && <p className="mt-1 text-[14px] leading-relaxed text-card-foreground/90">{n.description}</p>}
          {n.consequences && <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">→ {n.consequences}</p>}
          {n.quip && <p className="mt-1.5 text-[12px] italic text-muted-foreground">«{n.quip}»</p>}
        </div>
      ))}
    </div>
  )
}

/* ------------------- Текущая волна ------------------- */

function CurrentWave() {
  const payload = useLemStore((s) => s.payload)
  const generating = useLemStore((s) => s.generating)
  const waveError = useLemStore((s) => s.waveError)
  const selectNode = useLemStore((s) => s.selectNode)
  const generateNextWave = useLemStore((s) => s.generateNextWave)
  const regenerate = useLemStore((s) => s.regenerate)
  const busy = useLemStore((s) => s.busy)
  const lemRunning = useLemStore((s) => s.lemRunning)
  const settings = useLemStore((s) => s.settings)
  const ref = useRef<HTMLDivElement>(null)

  const wave = useMemo(() => {
    if (!payload?.currentNode) return []
    const cur = payload.currentNode
    const children = payload.nodes.filter((n) => n.parentId === cur.id)
    if (!children.length) return []
    const chosen = children.find((c) => c.isChosen)
    const genId = chosen?.generationId ?? children[children.length - 1]?.generationId
    return genId ? children.filter((c) => c.generationId === genId) : children
  }, [payload])

  const nextLevel = payload?.currentNode ? payload.currentNode.level + 1 : 1
  const act = actForLevel(nextLevel)

  // Плавная прокрутка к следующей волне после выбора (FR-2.4)
  const scrollKey = `${payload?.currentNode?.id ?? ''}-${generating}-${wave.length}`
  const lastScroll = useRef('')
  useEffect(() => {
    if (lastScroll.current === scrollKey) return
    lastScroll.current = scrollKey
    if (!payload?.project.category || payload.currentNode?.isFinal) return
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 250)
    return () => clearTimeout(t)
     
  }, [scrollKey])

  if (!payload || !payload.currentNode) return null
  const cur = payload.currentNode
  const canFinalize = cur.level >= BASE_LEVELS && !cur.isFinal

  return (
    <section ref={ref} className="scroll-mt-16" aria-label={`Волна уровня ${nextLevel}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[18px] font-semibold tracking-tight">
          Уровень {nextLevel} <span className="text-muted-foreground">· {act.name}</span>
        </h2>
        <span className="hidden text-[12px] text-muted-foreground sm:block">{act.focus}</span>
      </div>

      {generating ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Waves className="h-4 w-4 animate-pulse" />
            Калькулятор считает…
          </p>
          {Array.from({ length: Math.min(Math.max(settings?.waveSize ?? 7, 5), 10) }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : waveError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-[14px] font-medium text-red-800">Не удалось получить волну</p>
          <p className="mt-1 text-[13px] leading-snug text-red-700">{waveError.message}</p>
          {waveError.raw && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] text-red-700/80">Сырой текст ответа модели</summary>
              <pre className="lem-scroll mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px] text-red-900/80">
                {waveError.raw}
              </pre>
            </details>
          )}
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void generateNextWave()}>
            Попробовать снова
          </Button>
        </div>
      ) : wave.length === 0 ? (
        canFinalize ? null : (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
            <p className="text-sm text-muted-foreground">Развилки этого уровня ещё не сгенерированы</p>
            <Button size="sm" className="mt-3" onClick={() => void generateNextWave()} disabled={busy}>
              Сгенерировать развилки
            </Button>
          </div>
        )
      ) : (
        <>
          <div className="space-y-3">
            {wave.map((n: NodeDTO) => (
              <ForkCard
                key={n.id}
                node={n}
                state={n.isChosen ? 'selected' : 'normal'}
                disabled={busy || lemRunning}
                onSelect={(node) => void selectNode(node.id)}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void regenerate()} disabled={generating || busy || lemRunning}>
              Другие развилки
            </Button>
            <p className="text-[12px] text-muted-foreground">Прежние варианты останутся на карте-дереве</p>
          </div>
        </>
      )}
    </section>
  )
}

/* ------------------- Финал (FR-3.3) ------------------- */

function FinalePanel() {
  const payload = useLemStore((s) => s.payload)
  const selectNode = useLemStore((s) => s.selectNode)
  const generateNextWave = useLemStore((s) => s.generateNextWave)
  const setExportOpen = useLemStore((s) => s.setExportOpen)
  const busy = useLemStore((s) => s.busy)
  if (!payload?.currentNode) return null
  const cur = payload.currentNode
  if (cur.level < BASE_LEVELS) return null

  if (cur.isFinal) {
    return (
      <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 text-center" aria-label="Финал сюжета">
        <Flag className="mx-auto h-5 w-5 text-emerald-600" />
        <p className="mt-2 text-[18px] font-semibold tracking-tight text-emerald-900">(конец)</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-snug text-emerald-800/80">
          Сюжет финализирован: {levelCounter(cur.level)} пройден, путь зафиксирован на карте-дереве.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => setExportOpen(true)}>
            <BookOpen className="mr-2 h-4 w-4" />
            Собрать романную библию
          </Button>
          <Button variant="ghost" onClick={() => void generateNextWave()} disabled={busy}>
            Углубить эпилог ещё
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-accent/60 p-5 text-center" aria-label="Развязка достигнута">
      <p className="text-[15px] font-semibold">Сюжет дошёл до развязки</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-snug text-muted-foreground">
        Базовые 12 уровней пройдены. Завершите историю пометкой «(конец)» или углубите эпилог дополнительными уровнями.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => void selectNode(cur.id, true)} disabled={busy}>
          <Flag className="mr-2 h-4 w-4" />
          Завершить — (конец)
        </Button>
        <Button variant="secondary" onClick={() => void generateNextWave()} disabled={busy}>
          Углубить эпилог
        </Button>
      </div>
    </section>
  )
}

/* ------------------- Конструктор ------------------- */

export function Constructor() {
  const payload = useLemStore((s) => s.payload)
  const mapOpen = useLemStore((s) => s.mapOpen)
  const setMapOpen = useLemStore((s) => s.setMapOpen)
  const returnToNode = useLemStore((s) => s.returnToNode)
  const activePath = useMemo(() => new Set(payload?.activePathIds ?? []), [payload])

  if (!payload) return null

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <Header />
      {payload.project.premise && (
        <div className="border-b border-border/60 bg-muted/40">
          <p className="mx-auto w-full max-w-4xl px-4 py-1.5 text-[12px] italic text-muted-foreground">
            Посылка: {payload.project.premise}
          </p>
        </div>
      )}
      {!payload.project.category && <CategoryRibbon />}
      <PathRibbon />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6">
        <PathHistory />
        {payload.project.category && <CurrentWave />}
        {payload.project.category && <FinalePanel />}
        <div className="h-10" />
      </main>

      <footer className="border-t border-border/60 bg-secondary/50 py-4">
        <p className="mx-auto w-full max-w-4xl px-4 text-center text-[11px] text-muted-foreground/70">
          Калькулятор Лема · по мотивам блок-схемы «Карманный компьютер писателя-фантаста», 1973
        </p>
      </footer>

      <Sheet open={mapOpen} onOpenChange={setMapOpen}>
        <SheetContent side="right" className="flex w-[92vw] flex-col gap-0 p-0 sm:w-[420px]">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-[15px]">Карта-дерево</SheetTitle>
            <SheetDescription className="text-[12px]">
              Синим — пройденный путь, серым — альтернативы. Щелчок по узлу возвращает к уровню.
            </SheetDescription>
          </SheetHeader>
          <div id="tree-map-scroller" className="lem-scroll flex-1 overflow-auto p-3">
            <TreeMapContent
              nodes={payload.nodes}
              activePathIds={activePath}
              currentNodeId={payload.currentNode?.id ?? null}
              onReturn={(id) => {
                void returnToNode(id)
                setMapOpen(false)
              }}
              compact
            />
          </div>
          <div className="border-t border-border p-3">
            <MapFullscreenButton />
          </div>
        </SheetContent>
      </Sheet>

      <ExportDialog />
      <TreeMapDialog />
    </div>
  )
}
