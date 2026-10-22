'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLemStore } from '@/lib/store'
import { PROVIDERS, providerMeta } from '@/lib/lem/providers/meta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { CheckCircle2, ChevronLeft, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TestResult {
  ok: boolean
  latencyMs: number
  model: string
  error?: string
  /** Пояснение при успешной проверке запасным путём (через список моделей) */
  note?: string
  /** true — соединение выполнено в обход строгой проверки SSL (антивирус/прокси подменяет сертификат) */
  insecure?: boolean
}

/** Пояснение, когда подключение прошло через обход TLS-перехвата (см. tls-fetch.ts) */
const TLS_NOTE =
  'На вашем компьютере HTTPS-трафик к провайдеру перехватывает антивирус или прокси (подмена SSL-сертификата) — ' +
  'подключение выполнено автоматически в обход строгой проверки сертификата, только для запросов к провайдеру.'

/** Список моделей, подтянутый с сайта провайдера через /api/providers/models */
interface RemoteModels {
  models: string[]
  details: { id: string; contextLength?: number; priceIn?: number; priceOut?: number; currency?: string }[]
  fetchedAt: number
}
type RemoteCache = Record<string, RemoteModels>

const CACHE_KEY = 'lem.remoteModels.v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // сутки — потом список обновляется заново

function readCache(): RemoteCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as RemoteCache) : {}
  } catch {
    return {}
  }
}

function fmtCtx(len?: number): string | null {
  if (!len) return null
  return len >= 1_000_000 ? `${Math.round(len / 100_000) / 10}M` : `${Math.round(len / 1024)}k`
}

function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

/** Разбор ответа своего сервера: если пришёл HTML вместо JSON — объясняем, а не «Unexpected token '<'» */
async function readJsonOrExplain<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    let snippet = ''
    try {
      snippet = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    } catch {
      /* тела нет */
    }
    throw new Error(
      `Сервер приложения ответил HTML вместо JSON (HTTP ${res.status}). ` +
      `Нажмите F5 и повторите; если не помогает — закройте окно «Калькулятор Лема - СЕРВЕР» и запустите restart.bat: ` +
      `он очистит кэш и перезапустит приложение. Если и это не помогло — скопируйте папку проекта заново.` +
      (snippet ? ` Фрагмент: «${snippet}»` : ''),
    )
  }
}

export function SettingsScreen() {
  const settings = useLemStore((s) => s.settings)
  const loadSettings = useLemStore((s) => s.loadSettings)
  const saveSettings = useLemStore((s) => s.saveSettings)
  const setScreen = useLemStore((s) => s.setScreen)

  const [provider, setProvider] = useState<string>('zai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [temperature, setTemperature] = useState(0.8)
  const [waveSize, setWaveSize] = useState(7)
  const [lemPause, setLemPause] = useState(2)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [remote, setRemote] = useState<RemoteCache>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsStatus, setModelsStatus] = useState<string | null>(null)

  // локальная черновая копия настроек
  useEffect(() => {
    if (!settings) return
    setProvider(settings.provider)
    setModel(settings.model || providerMeta(settings.provider)?.defaultModel || '')
    setTemperature(settings.temperature)
    setWaveSize(settings.waveSize)
    setLemPause(settings.lemPauseSec)
    setBaseUrl(settings.baseUrls[settings.provider] ?? providerMeta(settings.provider)?.baseUrl ?? '')
  }, [settings])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const meta = providerMeta(provider)

  function pickProvider(code: string) {
    setProvider(code)
    setApiKey('')
    setResult(null)
    setModelsStatus(null)
    const m = providerMeta(code)
    setModel(m?.defaultModel ?? '')
    const saved = settings?.baseUrls[code]
    setBaseUrl(saved ?? m?.baseUrl ?? '')
  }

  const modelOptions = useMemo(() => {
    const list = [...(meta?.models ?? [])]
    const seen = new Set(list)
    for (const id of remote[provider]?.models ?? []) {
      if (!seen.has(id)) {
        seen.add(id)
        list.push(id)
      }
    }
    return list
  }, [meta, provider, remote])

  const modelDetail = useMemo(() => {
    const id = model.trim()
    return remote[provider]?.details.find((d) => d.id === id) ?? null
  }, [model, provider, remote])

  const sourceHost = useMemo(() => {
    try {
      return new URL(meta?.baseUrl ?? '').host
    } catch {
      return null
    }
  }, [meta])

  /** Подтянуть список моделей с сайта провайдера; без force — только если кэш устарел */
  async function fetchModels(code: string, force: boolean, opts?: { baseUrl?: string; apiKey?: string }) {
    const m = providerMeta(code)
    if (!m?.dynamicModels) return
    if (!force) {
      const cached = readCache()[code]
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        setRemote((prev) => (prev[code] ? prev : { ...prev, [code]: cached }))
        return
      }
    }
    setModelsLoading(true)
    setModelsStatus(null)
    try {
      const params = new URLSearchParams({ provider: code })
      if (opts?.baseUrl) params.set('baseUrl', opts.baseUrl)
      if (opts?.apiKey) params.set('apiKey', opts.apiKey)
      const res = await fetch(`/api/providers/models?${params.toString()}`)
      const data = (await readJsonOrExplain<{ ok?: boolean; models?: string[]; details?: RemoteModels['details']; error?: string }>(res))
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Не удалось получить список моделей')
      const entry: RemoteModels = { models: data.models ?? [], details: data.details ?? [], fetchedAt: Date.now() }
      setRemote((prev) => {
        const next = { ...prev, [code]: entry }
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next))
        } catch {
          /* приватный режим браузера — кэш не критичен */
        }
        return next
      })
    } catch (e) {
      setModelsStatus((e as Error).message)
    } finally {
      setModelsLoading(false)
    }
  }

  // автоподтягивание при выборе провайдера с динамическим списком
  useEffect(() => {
    if (!providerMeta(provider)?.dynamicModels) return
    void fetchModels(provider, false)
  }, [provider])

  // кэш подтянутых списков — из localStorage при открытии экрана
  useEffect(() => {
    const cached = readCache()
    if (Object.keys(cached).length) setRemote(cached)
  }, [])

  async function test() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
      })
      const data = (await readJsonOrExplain<TestResult & { error?: string }>(res))
      setResult({
        ...data,
        ok: res.ok && data.ok,
        error: data.error ?? (res.ok ? undefined : 'Ошибка запроса'),
        note: data.ok && data.insecure ? TLS_NOTE : undefined,
      })
    } catch (e) {
      // Сервис теста недоступен (сервер ответил HTML/404 или не ответил вовсе).
      // Для провайдеров с динамическим списком моделей проверяем соединение запасным
      // путём — через /api/providers/models, который не зависит от того маршрута.
      const primary = (e as Error).message
      if (meta?.dynamicModels) {
        try {
          const params = new URLSearchParams({ provider, probe: 'chat' })
          if (model.trim()) params.set('model', model.trim())
          if (baseUrl) params.set('baseUrl', baseUrl)
          if (apiKey.trim()) params.set('apiKey', apiKey.trim())
          const res2 = await fetch(`/api/providers/models?${params.toString()}`)
          const data2 = await readJsonOrExplain<{
            ok?: boolean
            count?: number
            error?: string
            insecure?: boolean
            chatProbe?: { ok: boolean; latencyMs: number; model: string; error?: string; insecure?: boolean }
          }>(res2)
          if (!res2.ok || !data2.ok) throw new Error(data2.error ?? 'Не удалось соединиться с провайдером')
          const probe = data2.chatProbe
          if (probe && !probe.ok) throw new Error(probe.error ?? 'Провайдер отклонил запрос')
          if (probe) {
            setResult({
              ok: true,
              latencyMs: probe.latencyMs,
              model: probe.model || model,
              note: probe.insecure || data2.insecure ? TLS_NOTE : undefined,
            })
          } else {
            // Запущенный сервер ещё не знает о probe=chat — но список моделей получен,
            // значит адрес и сайт провайдера доступны; полную проверку ключа сделает restart.bat
            setResult({
              ok: true,
              latencyMs: 0,
              model,
              note:
                `Соединение подтверждено: с сайта провайдера получен список из ${data2.count ?? 0} моделей. ` +
                `Для полной проверки ключа перезапустите restart.bat и повторите.` +
                (data2.insecure ? ` ${TLS_NOTE}` : ''),
            })
          }
        } catch (e2) {
          setResult({ ok: false, latencyMs: 0, model, error: (e2 as Error).message })
        }
      } else {
        setResult({ ok: false, latencyMs: 0, model, error: primary })
      }
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    setSaving(true)
    const ok = await saveSettings({
      provider,
      model,
      temperature,
      waveSize,
      lemPauseSec: lemPause,
      baseUrls: baseUrl && baseUrl !== meta?.baseUrl ? { [provider]: baseUrl } : {},
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    })
    setSaving(false)
    if (ok) {
      setApiKey('')
      // перечитываем состояние флагов ключей
      await loadSettings()
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Button variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => setScreen('library')}>
        <ChevronLeft className="mr-1 h-4 w-4" />
        В библиотеку
      </Button>
      <h1 className="text-[24px] font-semibold tracking-tight">Настройки</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Провайдер, модели и параметры генерации. Смена провайдера не требует перезапуска приложения.
      </p>

      <section className="mt-6" aria-label="Провайдер">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Провайдер</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => pickProvider(p.code)}
              className={cn(
                'rounded-lg border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                provider === p.code ? 'border-primary bg-primary/[0.06]' : 'border-border bg-card hover:border-primary/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="flex items-center gap-1.5">
                  {settings?.keys[p.code] && (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      ключ сохранён
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{p.note}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Подключение">
        {meta?.needsKey && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="s-key">API-ключ</Label>
              {settings?.keys[provider] && <span className="text-[11px] text-emerald-700">Ключ сохранён локально</span>}
            </div>
            <Input
              id="s-key"
              type="password"
              placeholder={settings?.keys[provider] ? 'Введите новый ключ, чтобы заменить' : 'Вставьте API-ключ'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <p className="text-[12px] text-muted-foreground">
              Ключ шифруется и хранится только на этой машине; в браузер и логи он не попадает.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="s-model">Модель</Label>
            {meta?.dynamicModels && remote[provider] && (
              <span className="text-[11px] text-muted-foreground">
                {remote[provider].models.length} моделей · обновлено в{' '}
                {new Date(remote[provider].fetchedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              id="s-model"
              list="s-model-list"
              className="flex-1"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={meta?.defaultModel}
            />
            {meta?.dynamicModels && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={modelsLoading}
                onClick={() => void fetchModels(provider, true, { baseUrl: baseUrl || undefined, apiKey: apiKey.trim() || undefined })}
                title={`Обновить список моделей с ${sourceHost ?? 'сайта провайдера'}`}
                aria-label="Обновить список моделей"
              >
                <RefreshCw className={cn('h-4 w-4', modelsLoading && 'animate-spin')} />
              </Button>
            )}
          </div>
          <datalist id="s-model-list">
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {modelsStatus && <p className="text-[12px] text-red-700">{modelsStatus}</p>}
          {modelDetail && (
            <p className="text-[12px] text-muted-foreground">
              {fmtCtx(modelDetail.contextLength) && <>Контекст {fmtCtx(modelDetail.contextLength)} · </>}
              {typeof modelDetail.priceIn === 'number' && typeof modelDetail.priceOut === 'number' && (
                <>
                  {fmtNum(modelDetail.priceIn)} / {fmtNum(modelDetail.priceOut)} {modelDetail.currency ?? 'BYN'} за 1M токенов (вход/выход)
                </>
              )}
            </p>
          )}
          <p className="text-[12px] text-muted-foreground">
            {meta?.dynamicModels
              ? `Выберите из списка или введите вручную. Кнопка обновления подтягивает актуальные модели с ${sourceHost ?? 'сайта провайдера'}.`
              : 'Выберите из списка или введите вручную.'}
          </p>
        </div>

        {meta?.baseUrlEditable && (
          <div className="space-y-1.5">
            <Label htmlFor="s-url">Базовый URL</Label>
            <Input id="s-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={meta.baseUrl} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={test} disabled={testing}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Проверить подключение
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить настройки
          </Button>
        </div>

        {result && (
          <div
            role="status"
            className={cn(
              'flex items-start gap-2 rounded-md border p-3 text-[13px]',
              result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
            )}
          >
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              {result.ok ? (
                <>
                  <div>
                    Подключение установлено · модель <b>{result.model}</b>
                    {result.latencyMs > 0 && <> · {result.latencyMs} мс</>}
                  </div>
                  {result.note && <div className="mt-1 text-[12px] leading-snug">{result.note}</div>}
                </>
              ) : (
                <>{result.error ?? 'Проверка не удалась'}</>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 space-y-6 rounded-lg border border-border bg-card p-4" aria-label="Параметры генерации">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Параметры генерации</h2>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Температура</Label>
            <span className="text-[13px] font-medium tabular-nums">{temperature.toFixed(2).replace('.', ',')}</span>
          </div>
          <Slider
            value={[temperature]}
            min={0.2}
            max={1.2}
            step={0.05}
            onValueChange={([v]) => setTemperature(v)}
            aria-label="Температура генерации"
          />
          <p className="mt-1 text-[12px] text-muted-foreground">Диапазон 0,2–1,2; по умолчанию 0,8.</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Размер волны</Label>
            <span className="text-[13px] font-medium tabular-nums">{waveSize} карточек</span>
          </div>
          <Slider
            value={[waveSize]}
            min={5}
            max={10}
            step={1}
            onValueChange={([v]) => setWaveSize(v)}
            aria-label="Размер волны"
          />
          <p className="mt-1 text-[12px] text-muted-foreground">Сколько развилок предлагает модель на каждом уровне.</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Пауза режима Лема</Label>
            <span className="text-[13px] font-medium tabular-nums">{lemPause} с</span>
          </div>
          <Slider value={[lemPause]} min={1} max={5} step={1} onValueChange={([v]) => setLemPause(v)} aria-label="Пауза режима Лема" />
          <p className="mt-1 text-[12px] text-muted-foreground">Задержка между автоматическими выборами: от 1 до 5 секунд.</p>
        </div>
      </section>
    </main>
  )
}
