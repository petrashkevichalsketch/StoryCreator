'use client'

import { create } from 'zustand'
import { toast } from '@/hooks/use-toast'
import { BASE_LEVELS } from './lem/acts'
import type { SettingsDTO, TreePayload, WaveErrorInfo } from './lem/types'

export type Screen = 'loading' | 'onboarding' | 'library' | 'constructor' | 'settings'

interface SettingsPatch {
  provider?: string
  model?: string
  temperature?: number
  waveSize?: number
  lemPauseSec?: number
  baseUrls?: Record<string, string>
  apiKey?: string | null
  onboarded?: boolean
}

interface LemStore {
  screen: Screen
  payload: TreePayload | null
  settings: SettingsDTO | null
  generating: boolean
  busy: boolean
  waveError: WaveErrorInfo | null
  lemRunning: boolean
  mapOpen: boolean
  mapFull: boolean
  exportOpen: boolean

  bootstrap: () => Promise<void>
  setScreen: (s: Screen) => void
  openProject: (id: string) => Promise<void>
  chooseCategory: (category: string) => Promise<void>
  selectNode: (nodeId: string, isFinal?: boolean) => Promise<void>
  returnToNode: (nodeId: string) => Promise<void>
  generateNextWave: () => Promise<boolean>
  regenerate: () => Promise<void>
  lemStart: () => void
  lemStop: () => void
  loadSettings: () => Promise<void>
  saveSettings: (patch: SettingsPatch) => Promise<boolean>
  refresh: () => Promise<void>
  setMapOpen: (open: boolean) => void
  setMapFull: (full: boolean) => void
  setExportOpen: (open: boolean) => void
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? `Ошибка ${res.status}`
  } catch {
    return `Ошибка ${res.status}`
  }
}

async function lemLoop() {
  const store = useLemStoreRef
  while (store.getState().lemRunning) {
    const pid = store.getState().payload?.project.id
    if (!pid) break
    try {
      const res = await fetch(`/api/projects/${pid}/lem`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ action: 'step' }),
      })
      const data = (await res.json()) as { payload?: TreePayload; done?: boolean; error?: string; kind?: string; raw?: string }
      if (!res.ok) {
        toast({ title: 'Режим Лема остановлен', description: data.error ?? 'Ошибка генерации', variant: 'destructive' })
        if (data.error) store.setState({ waveError: { message: data.error, kind: (data.kind as WaveErrorInfo['kind']) ?? 'provider', raw: data.raw } })
        break
      }
      if (data.payload) store.setState({ payload: data.payload })
      if (data.done) {
        toast({ title: '(конец)', description: 'Сюжет дошёл до финала в режиме Лема. Романная библия готова к сборке.' })
        break
      }
      const pause = (store.getState().settings?.lemPauseSec ?? 2) * 1000
      await new Promise((r) => setTimeout(r, pause))
    } catch {
      toast({ title: 'Режим Лема остановлен', description: 'Не удалось связаться с сервером', variant: 'destructive' })
      break
    }
  }
  store.setState({ lemRunning: false })
}

const useLemStoreRef = create<LemStore>((set, get) => ({
  screen: 'loading',
  payload: null,
  settings: null,
  generating: false,
  busy: false,
  waveError: null,
  lemRunning: false,
  mapOpen: false,
  mapFull: false,
  exportOpen: false,

  setMapOpen: (open) => set({ mapOpen: open }),
  setMapFull: (full) => set({ mapFull: full }),
  setExportOpen: (open) => set({ exportOpen: open }),

  setScreen: (s) => set({ screen: s }),

  loadSettings: async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) set({ settings: (await res.json()) as SettingsDTO })
    } catch {
      /* настройки подгрузятся позже */
    }
  },

  bootstrap: async () => {
    try {
      const res = await fetch('/api/state')
      const data = (await res.json()) as { onboarded: boolean }
      await get().loadSettings()
      set({ screen: data.onboarded ? 'library' : 'onboarding' })
    } catch {
      set({ screen: 'onboarding' })
    }
  },

  openProject: async (id) => {
    set({ busy: true, waveError: null })
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) throw new Error(await parseError(res))
      const payload = (await res.json()) as TreePayload
      set({ payload, screen: 'constructor' })
    } catch (e) {
      toast({ title: 'Не удалось открыть проект', description: (e as Error).message, variant: 'destructive' })
    } finally {
      set({ busy: false })
    }
  },

  refresh: async () => {
    const pid = get().payload?.project.id
    if (!pid) return
    const res = await fetch(`/api/projects/${pid}`)
    if (res.ok) set({ payload: (await res.json()) as TreePayload })
  },

  chooseCategory: async (category) => {
    const pid = get().payload?.project.id
    if (!pid) return
    set({ busy: true, waveError: null })
    try {
      const res = await fetch(`/api/projects/${pid}/category`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ category }),
      })
      const data = (await res.json()) as TreePayload & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Не удалось закрепить категорию')
      set({ payload: data })
      await get().generateNextWave()
    } catch (e) {
      toast({ title: 'Ошибка', description: (e as Error).message, variant: 'destructive' })
    } finally {
      set({ busy: false })
    }
  },

  selectNode: async (nodeId, isFinal) => {
    if (get().busy) return
    set({ busy: true, waveError: null })
    try {
      const res = await fetch(`/api/branches/${nodeId}/select`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ isFinal: !!isFinal }),
      })
      const data = (await res.json()) as TreePayload & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Не удалось зафиксировать выбор')
      set({ payload: data })
      const cur = data.currentNode
      // FR-3.3: после 12-го уровня предложение финализировать — без автогенерации
      if (cur && !cur.isFinal && cur.level < BASE_LEVELS && !data.nodes.some((n) => n.parentId === cur.id)) {
        set({ busy: false })
        await get().generateNextWave()
      }
    } catch (e) {
      toast({ title: 'Ошибка', description: (e as Error).message, variant: 'destructive' })
      set({ busy: false })
    } finally {
      if (get().busy) set({ busy: false })
    }
  },

  returnToNode: async (nodeId) => {
    if (get().lemRunning) {
      toast({ title: 'Сначала остановите режим Лема', description: 'Нажмите «Стоп» в шапке конструктора.' })
      return
    }
    set({ busy: true, waveError: null })
    try {
      const res = await fetch(`/api/branches/${nodeId}/return`, { method: 'POST' })
      const data = (await res.json()) as TreePayload & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Не удалось вернуться к узлу')
      set({ payload: data })
    } catch (e) {
      toast({ title: 'Ошибка', description: (e as Error).message, variant: 'destructive' })
    } finally {
      set({ busy: false })
    }
  },

  generateNextWave: async () => {
    const payload = get().payload
    if (!payload?.currentNode) return false
    set({ generating: true, waveError: null })
    try {
      const res = await fetch(`/api/projects/${payload.project.id}/branches`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ nodeId: payload.currentNode.id }),
      })
      const data = (await res.json()) as { payload?: TreePayload; error?: string; kind?: string; raw?: string }
      if (!res.ok) {
        set({ waveError: { message: data.error ?? 'Ошибка генерации', kind: (data.kind as WaveErrorInfo['kind']) ?? 'provider', raw: data.raw } })
        return false
      }
      if (data.payload) set({ payload: data.payload })
      return true
    } catch (e) {
      set({ waveError: { message: (e as Error).message, kind: 'unknown' } })
      return false
    } finally {
      set({ generating: false })
    }
  },

  regenerate: async () => {
    const payload = get().payload
    if (!payload?.currentNode || get().generating || get().busy) return
    set({ generating: true, waveError: null })
    try {
      const res = await fetch(`/api/branches/${payload.currentNode.id}/regenerate`, { method: 'POST' })
      const data = (await res.json()) as { payload?: TreePayload; error?: string; kind?: string; raw?: string }
      if (!res.ok) {
        set({ waveError: { message: data.error ?? 'Ошибка регенерации', kind: (data.kind as WaveErrorInfo['kind']) ?? 'provider', raw: data.raw } })
        return
      }
      if (data.payload) set({ payload: data.payload })
      toast({ title: 'Новая волна готова', description: 'Прежние варианты остались на карте-дереве.' })
    } catch (e) {
      set({ waveError: { message: (e as Error).message, kind: 'unknown' } })
    } finally {
      set({ generating: false })
    }
  },

  lemStart: () => {
    if (get().lemRunning) return
    const payload = get().payload
    if (!payload) return
    set({ lemRunning: true, waveError: null })
    void lemLoop()
  },

  lemStop: () => {
    set({ lemRunning: false })
  },

  saveSettings: async (patch) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      })
      const data = (await res.json()) as SettingsDTO & { error?: string }
      if (!res.ok) {
        toast({ title: 'Не сохранено', description: data.error ?? 'Ошибка', variant: 'destructive' })
        return false
      }
      set({ settings: data })
      return true
    } catch (e) {
      toast({ title: 'Не сохранено', description: (e as Error).message, variant: 'destructive' })
      return false
    }
  },
}))

export const useLemStore = useLemStoreRef
