'use client'

import { useMemo, useState } from 'react'
import { useLemStore } from '@/lib/store'
import { PROVIDERS } from '@/lib/lem/providers/meta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TestResult {
  ok: boolean
  latencyMs: number
  model: string
  error?: string
}

export function Onboarding() {
  const bootstrap = useLemStore((s) => s.bootstrap)
  const saveSettings = useLemStore((s) => s.saveSettings)
  const [provider, setProvider] = useState('zai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const meta = useMemo(() => PROVIDERS.find((p) => p.code === provider)!, [provider])

  async function testKey() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
      })
      const data = (await res.json()) as TestResult & { error?: string }
      setResult({ ...data, ok: res.ok && data.ok, error: data.error ?? (res.ok ? undefined : 'Ошибка запроса') })
    } catch (e) {
      setResult({ ok: false, latencyMs: 0, model: meta.defaultModel, error: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  async function enter() {
    const patch = { provider, onboarded: true }
    if (apiKey.trim()) (patch as Record<string, unknown>).apiKey = apiKey.trim()
    if (baseUrl.trim()) (patch as Record<string, unknown>).baseUrls = { [provider]: baseUrl.trim() }
    const ok = await saveSettings(patch)
    if (ok) await bootstrap()
  }

  return (
    <main className="flex min-h-screen flex-1 items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            { }
            <img src="/lem-icon.svg" alt="Калькулятор Лема" className="h-9 w-9" />
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight">Калькулятор Лема</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Интерактивный конструктор сюжета романа. Первый запуск: выберите провайдера языковой модели.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => {
                setProvider(p.code)
                setResult(null)
                setApiKey('')
                setBaseUrl('')
              }}
              className={cn(
                'rounded-lg border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                provider === p.code ? 'border-primary bg-primary/[0.06]' : 'border-border bg-card hover:border-primary/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{p.name}</span>
                {provider === p.code && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{p.note}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3 rounded-lg border border-border bg-card p-4">
          {meta.needsKey && (
            <div className="space-y-1.5">
              <Label htmlFor="apikey">API-ключ {meta.name}</Label>
              <Input
                id="apikey"
                type="password"
                placeholder="Вставьте ключ провайдера"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <p className="text-[12px] text-muted-foreground">
                Ключ хранится только локально в шифрованном виде и не покидает этот компьютер.
              </p>
            </div>
          )}
          {meta.baseUrlEditable && (
            <div className="space-y-1.5">
              <Label htmlFor="baseurl">Базовый URL (необязательно)</Label>
              <Input id="baseurl" placeholder={meta.baseUrl ?? ''} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={testKey} disabled={testing}>
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Проверить ключ
            </Button>
            {!meta.needsKey && (
              <Button variant="secondary" onClick={enter}>
                Продолжить без ключа
              </Button>
            )}
          </div>

          {result && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-md border p-3 text-[13px]',
                result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
              )}
              role="status"
            >
              {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <div>
                {result.ok ? (
                  <>
                    Подключение установлено · модель <b>{result.model}</b> · {result.latencyMs} мс
                  </>
                ) : (
                  <>{result.error ?? 'Проверка не удалась'}</>
                )}
              </div>
            </div>
          )}

          <p className="text-[12px] leading-snug text-muted-foreground">
            Можно продолжить без проверки: провайдера и ключ удастся сменить в настройках в любой момент.
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={enter} disabled={testing} className="min-w-40">
            В библиотеку проектов
          </Button>
        </div>
      </div>
    </main>
  )
}
