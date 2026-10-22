'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CheckCheck, Loader2, PenLine, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useLemStore } from '@/lib/store'
import type { NodeDTO, Tone } from '@/lib/lem/types'
import { TONE_LABELS, TONES } from '@/lib/lem/types'
import { MAX_EDIT_CONSEQUENCES_LEN, MAX_EDIT_DESCRIPTION_LEN, MAX_TITLE_LEN } from '@/lib/lem/validator'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Phase = 'idle' | 'saving' | 'accepting'

const TONE_DOTS: Record<Tone, string> = {
  dark: 'bg-gray-500',
  light: 'bg-emerald-500',
  ironic: 'bg-amber-500',
  neutral: 'bg-blue-500',
}

interface EditVariantDialogProps {
  /** узел, открытый на редактирование; null — окно закрыто */
  node: NodeDTO | null
  onClose: () => void
}

/**
 * 3D-окно правки варианта развития события:
 * распахивается из глубины с поворотом, слои заголовка и подвала живут
 * на разной глубине (лёгкий параллакс за курсором), внутри — поля правки
 * и кнопка «Сохранить и принять», которая фиксирует правку, принимает
 * вариант и запускает генерацию следующего этапа.
 */
export function EditVariantDialog({ node, onClose }: EditVariantDialogProps) {
  // пока идёт сохранение/принятие, окно нельзя закрыть (Esc, клик мимо, крестик)
  const busyRef = useRef(false)
  const guardClose = (e: Event) => {
    if (busyRef.current) e.preventDefault()
  }

  return (
    <DialogPrimitive.Root open={!!node} onOpenChange={(o) => !o && !busyRef.current && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className="lem-dialog-3d fixed left-1/2 top-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 focus:outline-none sm:max-w-xl"
          style={{ perspective: '1200px' }}
          onEscapeKeyDown={guardClose}
          onPointerDownOutside={guardClose}
          onInteractOutside={guardClose}
        >
          {/* key по узлу: форма всегда открывается с чистыми значениями этого узла */}
          {node && <EditVariantForm key={node.id} node={node} onClose={onClose} onBusyChange={(b) => (busyRef.current = b)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ----------------------------- Форма правки ----------------------------- */

interface EditVariantFormProps {
  node: NodeDTO
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

function EditVariantForm({ node, onClose, onBusyChange }: EditVariantFormProps) {
  const updateNode = useLemStore((s) => s.updateNode)
  const saveAndAccept = useLemStore((s) => s.saveAndAccept)

  // значения инициализируются один раз при открытии формы (компонент keyed по node.id)
  const [title, setTitle] = useState(node.title)
  const [description, setDescription] = useState(node.description)
  const [consequences, setConsequences] = useState(node.consequences)
  const [tone, setTone] = useState<Tone | null>(node.tone)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onBusyChange(phase !== 'idle')
  }, [phase, onBusyChange])

  const trimmedTitle = title.trim()
  const trimmedDescription = description.trim()
  const canSave = !!trimmedTitle && !!trimmedDescription && phase === 'idle'
  const dirty = title !== node.title || description !== node.description || consequences !== node.consequences || tone !== node.tone

  /* ---- лёгкий 3D-наклон окна за курсором (только мышь, ~±2°) ---- */
  const tiltRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const resetTilt = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (tiltRef.current) tiltRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)'
    })
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (tiltRef.current) {
        tiltRef.current.style.transform = `rotateX(${(-py * 3.4).toFixed(2)}deg) rotateY(${(px * 4.2).toFixed(2)}deg)`
      }
    })
  }, [])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const patch = () => ({
    title: trimmedTitle,
    description: trimmedDescription,
    consequences: consequences.trim(),
    tone,
  })

  /* ---- сохранение правки без принятия ---- */
  const handleSave = async () => {
    if (!canSave) return
    setPhase('saving')
    setError(null)
    const err = await updateNode(node.id, patch())
    if (err) {
      setError(err)
      setPhase('idle')
      return
    }
    toast({ title: 'Вариант сохранён', description: 'Правка осталась в этом узле дерева.' })
    setPhase('idle')
    onClose()
  }

  /* ---- «Сохранить и принять»: правка → выбор узла → следующий этап ---- */
  const handleSaveAccept = async () => {
    if (!canSave) return
    setPhase('accepting')
    setError(null)
    const err = await saveAndAccept(node.id, patch())
    if (err) {
      setError(err)
      setPhase('idle')
      return
    }
    toast({ title: 'Правка принята', description: 'Калькулятор считает следующий этап сюжета…' })
    setPhase('idle')
    onClose()
  }

  const busy = phase !== 'idle'

  return (
    <div
      ref={tiltRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      className="lem-3d-card relative overflow-hidden rounded-xl border border-border/80 bg-background shadow-[0_30px_90px_-20px_rgba(26,86,219,0.45),0_10px_30px_-12px_rgba(0,0,0,0.25)]"
    >
      {/* декоративная верхняя грань окна */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 via-sky-400/80 to-emerald-400/60"
      />

      {/* шапка — слой, парящий над окном */}
      <div className="lem-3d-layer-header relative flex items-start gap-3 border-b border-border/70 bg-gradient-to-b from-accent/70 to-transparent px-5 pb-4 pt-5">
        <span className="lem-3d-pop inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky-500 text-white shadow-[0_8px_20px_-6px_rgba(26,86,219,0.6)]">
          <PenLine className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <DialogPrimitive.Title className="text-[16px] font-semibold leading-tight text-card-foreground">
            Редактировать вариант
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Уровень {node.level} · {node.act}. Измените развитие события — правка сохранится только у этого варианта.
          </DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close
          disabled={busy}
          className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Закрыть</span>
        </DialogPrimitive.Close>
      </div>

      {/* поля правки */}
      <div className="space-y-4 px-5 py-4">
        <div className="space-y-1.5">
          <label htmlFor="lem-edit-title" className="text-[13px] font-medium text-card-foreground">
            Название события
          </label>
          <Input
            id="lem-edit-title"
            value={title}
            maxLength={MAX_TITLE_LEN}
            autoFocus
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Что происходит в этот момент сюжета"
            className="h-9 text-[14px]"
          />
          <p className="text-[11px] leading-none text-muted-foreground/70">
            {title.length}/{MAX_TITLE_LEN}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lem-edit-description" className="text-[13px] font-medium text-card-foreground">
            Развитие события
          </label>
          <Textarea
            id="lem-edit-description"
            value={description}
            maxLength={MAX_EDIT_DESCRIPTION_LEN}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Как именно разворачиваются события в этом варианте"
            rows={6}
            className="lem-scroll resize-y text-[14px] leading-relaxed"
          />
          <p className="text-[11px] leading-none text-muted-foreground/70">
            {description.length}/{MAX_EDIT_DESCRIPTION_LEN}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lem-edit-consequences" className="text-[13px] font-medium text-card-foreground">
            Последствия
          </label>
          <Textarea
            id="lem-edit-consequences"
            value={consequences}
            maxLength={MAX_EDIT_CONSEQUENCES_LEN}
            disabled={busy}
            onChange={(e) => setConsequences(e.target.value)}
            placeholder="К чему это приведёт на следующих уровнях"
            rows={2}
            className="lem-scroll resize-y text-[13px] leading-relaxed"
          />
          <p className="text-[11px] leading-none text-muted-foreground/70">
            → появится мелкой строкой под описанием · {consequences.length}/{MAX_EDIT_CONSEQUENCES_LEN}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-card-foreground">Тон</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Тон варианта">
            {TONES.map((t) => {
              const active = tone === t
              return (
                <button
                  key={t}
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  onClick={() => setTone(active ? null : t)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    active
                      ? 'border-primary bg-primary/[0.08] text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOTS[t])} />
                  {TONE_LABELS[t]}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] leading-snug text-red-700">
            {error}
          </p>
        )}
      </div>

      {/* подвал — чуть приподнят над окном */}
      <div className="lem-3d-layer-footer flex flex-wrap items-center gap-2 border-t border-border/70 bg-muted/40 px-5 py-3.5">
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
          {phase === 'saving' && 'Сохраняем правку…'}
          {phase === 'accepting' && 'Принимаем вариант и считаем следующий этап…'}
          {phase === 'idle' && (dirty ? 'Правка коснётся только этого варианта' : 'Изменений пока нет')}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={!canSave}>
            {phase === 'saving' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Сохранить
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSaveAccept()}
            disabled={!canSave}
            title="Сохранить правку, принять вариант и запустить следующий этап"
          >
            {phase === 'accepting' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1.5 h-3.5 w-3.5" />}
            {phase === 'accepting' ? 'Принимаем…' : 'Сохранить и принять'}
          </Button>
        </div>
      </div>
    </div>
  )
}
