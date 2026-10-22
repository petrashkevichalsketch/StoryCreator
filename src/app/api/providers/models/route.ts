// Подтягивание списка моделей с сайта провайдера (GET /api/providers/models).
// Работает для OpenAI-совместимых провайдеров, у которых есть эндпоинт GET /models.
// Для AIAI.BY список публичный — ключ не обязателен; дополнительно отдаём
// метаданные моделей (контекст, цены в BYN), отфильтровав нечатовые модели.

import { NextRequest, NextResponse } from 'next/server'
import { providerMeta } from '@/lib/lem/providers/meta'
import { getAdapter } from '@/lib/lem/providers'
import { buildProviderConfig } from '@/lib/lem/settings'
import { providerFetch } from '@/lib/lem/providers/tls-fetch'
import type { TestResult } from '@/lib/lem/providers/types'

export const runtime = 'nodejs'

/** Провайдеры, чей GET /models совместим с форматом OpenAI { data: [{ id }] } */
const SUPPORTED = new Set(['aiai', 'openai', 'glm', 'deepseek'])

/** Нечатовые категории AIAI.BY (эмбеддинги, картинки, видео, аудио) не подходят конструктору */
const CHAT_CATEGORIES = new Set(['general', 'coding'])

interface AiaiModelRaw {
  id?: string
  category?: string
  services?: string[]
  features?: string[]
  output_modalities?: string[]
  context_length?: number
  price_currency?: string
  sell_pricing?: {
    chat?: { per_1m_input?: number; per_1m_output?: number }
  }
}

export interface ModelDetail {
  id: string
  contextLength?: number
  priceIn?: number
  priceOut?: number
  currency?: string
  features?: string[]
}

function humanError(status: number): string {
  if (status === 401 || status === 403) return 'Провайдер отклонил ключ — вставьте действующий API-ключ.'
  if (status === 429) return 'Провайдер перегружен, попробуйте обновить список через минуту.'
  if (status === 404) return 'У провайдера нет эндпоинта /models по этому адресу.'
  if (status >= 500) return 'Сайт провайдера временно недоступен, попробуйте позже.'
  return `Провайдер вернул ошибку ${status}.`
}

/** Ошибка с уже готовым человекочитаемым сообщением — пробрасывается в ответ как есть */
class FriendlyError extends Error {}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const provider = sp.get('provider') ?? 'aiai'
  const meta = providerMeta(provider)
  if (!meta) return NextResponse.json({ ok: false, error: 'Неизвестный провайдер' }, { status: 400 })
  if (!SUPPORTED.has(provider)) {
    return NextResponse.json(
      { ok: false, error: 'Для этого провайдера список моделей подтягивать не требуется — он задан вручную.' },
      { status: 400 },
    )
  }

  const baseUrl = (sp.get('baseUrl') || meta.baseUrl || '').replace(/\/+$/, '')
  if (!baseUrl) return NextResponse.json({ ok: false, error: 'Не задан базовый URL провайдера' }, { status: 400 })

  // Ключ: ещё не сохранённый из формы либо ранее сохранённый (расшифровывается только в памяти)
  const cfg = await buildProviderConfig(provider, {
    model: sp.get('model')?.trim() || undefined,
    baseUrl,
    apiKey: sp.get('apiKey')?.trim() || undefined,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    // providerFetch: строгий SSL + авто-повтор без проверки сертификата,
    // если HTTPS перехватывается антивирусом/прокси на машине пользователя
    const { res, insecure } = await providerFetch(`${baseUrl}/models`, {
      signal: controller.signal,
      headers: {
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: humanError(res.status) }, { status: 502 })

    let data: { data?: AiaiModelRaw[] }
    try {
      data = (await res.json()) as { data?: AiaiModelRaw[] }
    } catch {
      throw new FriendlyError(
        `Сайт провайдера вернул страницу HTML вместо JSON (HTTP ${res.status}). ` +
        'Проверьте базовый URL — он должен быть адресом API и заканчиваться на /v1.',
      )
    }
    const raw = (Array.isArray(data?.data) ? data.data : []).filter((m) => typeof m?.id === 'string' && m.id)

    // AIAI.BY отдаёт расширенные метаданные — фильтруем и обогащаем;
    // у остальных провайдеров берём идентификаторы как есть.
    const isAiai = raw.some((m) => m.category || m.sell_pricing || m.output_modalities)
    const details: ModelDetail[] = []
    let models: string[]

    if (isAiai) {
      for (const m of raw) {
        const chatPricing = !!m.sell_pricing?.chat
        const textOut = (m.output_modalities ?? []).includes('text')
        if (!textOut || !chatPricing) continue
        if (!CHAT_CATEGORIES.has(m.category ?? '')) continue
        details.push({
          id: m.id as string,
          contextLength: m.context_length,
          priceIn: m.sell_pricing?.chat?.per_1m_input,
          priceOut: m.sell_pricing?.chat?.per_1m_output,
          currency: m.price_currency,
          features: m.features,
        })
      }
      details.sort((a, b) => a.id.localeCompare(b.id))
      models = details.map((d) => d.id)
    } else {
      models = raw.map((m) => m.id as string).sort((a, b) => a.localeCompare(b))
    }

    if (!models.length) {
      return NextResponse.json({ ok: false, error: 'Провайдер не вернул ни одной подходящей модели.' }, { status: 502 })
    }

    // Запасной путь кнопки «Проверить подключение» (probe=chat): после успешного
    // получения списка моделей делаем реальный мини-запрос к chat/completions —
    // так проверяется и ключ, даже если основной маршрут /api/settings/test
    // недоступен на запущенном сервере.
    let chatProbe: TestResult | undefined
    if (sp.get('probe') === 'chat') {
      try {
        chatProbe = await getAdapter(provider).test(cfg)
      } catch (e) {
        chatProbe = { ok: false, latencyMs: 0, model: cfg.model ?? '', error: (e as Error).message }
      }
    }

    return NextResponse.json({
      ok: true,
      provider,
      source: `${baseUrl}/models`,
      count: models.length,
      models,
      ...(isAiai ? { details } : {}),
      ...(insecure ? { insecure } : {}),
      ...(chatProbe ? { chatProbe } : {}),
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    const err = e as Error
    const message =
      err.name === 'AbortError'
        ? 'Сайт провайдера не ответил за 15 секунд. Проверьте базовый URL или попробуйте позже.'
        : err instanceof FriendlyError
          ? err.message
          : 'Нет соединения с сайтом провайдера. Проверьте интернет или базовый URL.'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}
