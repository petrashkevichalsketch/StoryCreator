'use client'

import { useEffect, useState } from 'react'
import { useLemStore } from '@/lib/store'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { Check, Download, FileJson, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Stats {
  generations: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  failed: number
}

async function downloadFile(url: string) {
  const res = await fetch(url)
  if (!res.ok) {
    let message = `Ошибка ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      /* не JSON */
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = cd.match(/filename\*=UTF-8''([^;\s]+)/)
  const name = m ? decodeURIComponent(m[1]) : 'export'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

const COMPOSITION = [
  'Титульный блок: имя проекта, категория, посылка, дата',
  'Синопсис по уровням: выбранные развилки, описания и последствия',
  'Сводка героя и центрального конфликта по фактическим узлам',
  'Концовка',
  'Перечень отвергнутых альтернатив краткими строками',
]

export function ExportDialog() {
  const payload = useLemStore((s) => s.payload)
  const open = useLemStore((s) => s.exportOpen)
  const setOpen = useLemStore((s) => s.setExportOpen)
  const [format, setFormat] = useState<'md' | 'docx'>('docx')
  const [busy, setBusy] = useState<'export' | 'file' | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!open || !payload) return
    setStats(null)
    void fetch(`/api/projects/${payload.project.id}/stats`)
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
      .then(setStats)
      .catch(() => setStats(null))
  }, [open, payload])

  if (!payload) return null

  async function run(kind: 'export' | 'file', url: string) {
    setBusy(kind)
    try {
      await downloadFile(url)
      toast({ title: 'Файл выгружен', description: 'Проверьте загрузки браузера.' })
    } catch (e) {
      toast({ title: 'Выгрузка не удалась', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Романная библия</DialogTitle>
          <DialogDescription>
            Экспорт доступен в любой момент работы, не только после финального уровня.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={format} onValueChange={(v) => setFormat(v as 'md' | 'docx')} className="gap-2">
          <Label
            htmlFor="fmt-docx"
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              format === 'docx' ? 'border-primary bg-primary/[0.06]' : 'border-border hover:border-primary/40'
            )}
          >
            <RadioGroupItem value="docx" id="fmt-docx" className="mt-0.5" />
            <span>
              <span className="block text-sm font-semibold">Word (.docx)</span>
              <span className="block text-[12px] text-muted-foreground">
                Открывается в Word без ручных исправлений: стили заголовков, UTF-8.
              </span>
            </span>
          </Label>
          <Label
            htmlFor="fmt-md"
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              format === 'md' ? 'border-primary bg-primary/[0.06]' : 'border-border hover:border-primary/40'
            )}
          >
            <RadioGroupItem value="md" id="fmt-md" className="mt-0.5" />
            <span>
              <span className="block text-sm font-semibold">Markdown (.md)</span>
              <span className="block text-[12px] text-muted-foreground">
                Универсальный текстовый каркас для любых редакторов.
              </span>
            </span>
          </Label>
        </RadioGroup>

        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-1.5 text-[12px] font-medium">Состав документа</p>
          <ul className="space-y-1">
            {COMPOSITION.map((c) => (
              <li key={c} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                {c}
              </li>
            ))}
          </ul>
        </div>

        {stats && (
          <p className="text-[11px] text-muted-foreground">
            История: {stats.generations} генераций · {stats.tokensIn + stats.tokensOut > 0 ? `${stats.tokensIn + stats.tokensOut} токенов` : 'токены не учитываются'} · оценка расходов ≈ ${stats.costUsd.toFixed(3)}
            {stats.failed > 0 ? ` · неуспешных: ${stats.failed}` : ''}
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            disabled={busy !== null}
            onClick={() => void run('export', `/api/projects/${payload.project.id}/export?format=${format}`)}
          >
            {busy === 'export' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Выгрузить библию
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void run('file', `/api/projects/${payload.project.id}/file`)}
          >
            {busy === 'file' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}
            Скачать проект (.lem.json)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
