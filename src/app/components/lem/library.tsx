'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLemStore } from '@/lib/store'
import { providerName } from '@/lib/lem/providers/meta'
import { levelCounter, actForLevel } from '@/lib/lem/acts'
import type { ProjectListItem } from '@/lib/lem/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import { CategoryChip } from './ui-bits'
import { Copy, Download, MoreVertical, Plus, Settings, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const openProject = useLemStore((s) => s.openProject)
  const settings = useLemStore((s) => s.settings)
  const [name, setName] = useState('')
  const [premise, setPremise] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) {
      toast({ title: 'Введите название сюжета', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), premise: premise.trim() }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Не удалось создать проект')
      onOpenChange(false)
      setName('')
      setPremise('')
      await openProject(data.id)
    } catch (e) {
      toast({ title: 'Ошибка', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый сюжет</DialogTitle>
          <DialogDescription>
            Категорию романа выберете в конструкторе — она закрепится в шапке на весь проект.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="projname">Название</Label>
            <Input
              id="projname"
              placeholder="Например: «Город без электричества»"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && create()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projpremise">Своя посылка (необязательно)</Label>
            <Textarea
              id="projpremise"
              placeholder="Одна-две фразы о замысле: что за история и зачем она вам"
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              rows={3}
            />
          </div>
          <p className="text-[12px] text-muted-foreground">
            Проект будет строиться через: <b>{providerName(settings?.provider ?? '')}</b>
            {settings?.model ? ` · ${settings.model}` : ''}
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={create} disabled={busy}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Library() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const openProject = useLemStore((s) => s.openProject)
  const setScreen = useLemStore((s) => s.setScreen)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      const data = (await res.json()) as { projects: ProjectListItem[] }
      setProjects(data.projects)
    } catch {
      toast({ title: 'Не удалось загрузить проекты', variant: 'destructive' })
      setProjects([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function duplicate(id: string) {
    const res = await fetch(`/api/projects/${id}/duplicate`, { method: 'POST' })
    if (res.ok) {
      toast({ title: 'Проект продублирован' })
      await load()
    } else toast({ title: 'Не удалось продублировать', variant: 'destructive' })
  }

  async function remove(id: string) {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast({ title: 'Проект удалён' })
      setDeleteId(null)
      await load()
    } else toast({ title: 'Не удалось удалить', variant: 'destructive' })
  }

  async function importFile(file: File) {
    try {
      const text = await file.text()
      const res = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Импорт не удался')
      toast({ title: 'Проект импортирован' })
      await load()
    } catch (e) {
      toast({ title: 'Импорт не удался', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-[24px] font-semibold tracking-tight">
            { }
            <img src="/lem-icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            Калькулятор Лема
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Интерактивный конструктор сюжета романа: 12 уровней, волны развилок, режим Лема и романная библия.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => importRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Импорт
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,.lem.json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
          <Button variant="ghost" size="icon" aria-label="Настройки" onClick={() => setScreen('settings')}>
            <Settings className="h-5 w-5" />
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Новый сюжет
          </Button>
        </div>
      </header>

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-muted/60" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-12 text-center">
          <p className="text-[15px] font-medium">Проектов пока нет</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Создайте первый сюжет: выберите категорию, пройдите 12 развилок — и соберите романную библию.
          </p>
          <Button className="mt-4" onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Новый сюжет
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => void openProject(p.id)}
              onKeyDown={(e) => e.key === 'Enter' && void openProject(p.id)}
              className={cn(
                'group flex cursor-pointer flex-col rounded-lg border border-border bg-card p-4 transition-all duration-200',
                'hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(26,86,219,0.10)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[16px] font-semibold leading-snug">{p.name}</h2>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8" aria-label="Действия с проектом">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => void duplicate(p.id)}>
                      <Copy className="mr-2 h-4 w-4" /> Дублировать
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={`/api/projects/${p.id}/file`} download>
                        <Download className="mr-2 h-4 w-4" /> Скачать .lem.json
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteId(p.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-1.5">
                {p.category ? (
                  <CategoryChip name={p.category} />
                ) : (
                  <span className="text-xs text-muted-foreground">Категория не выбрана</span>
                )}
              </div>
              {p.premise && <p className="mt-2 line-clamp-2 text-[12px] italic leading-snug text-muted-foreground">«{p.premise}»</p>}
              <div className="mt-auto pt-3">
                <p className="text-[12px] text-muted-foreground">
                  {p.level > 0 ? (
                    <>
                      {levelCounter(p.level)}
                      {p.level > 0 && <> · {actForLevel(p.level).name}</>}
                      {p.isFinal && <> · <span className="font-medium">(конец)</span></>}
                    </>
                  ) : (
                    'Не начат'
                  )}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Изменён {formatDate(p.updatedAt)} · {providerName(p.provider ?? '')}
                  {p.model ? ` · ${p.model}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
            <AlertDialogDescription>
              Дерево сюжета, альтернативные ветки и история генераций будут удалены безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteId && void remove(deleteId)}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
