// Общий адаптер для OpenAI-совместимых REST API: OpenAI, Z.ai GLM, DeepSeek

import { describeHttpStatus, estimateTokens, type GenerateOpts, type LLMAdapter, type LLMResult, type ProviderConfig, type TestResult } from './types'
import { providerFetch } from './tls-fetch'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function chatCompletions(cfg: ProviderConfig, messages: ChatMessage[], timeoutMs: number, useJsonMode: boolean): Promise<{ raw: string; tokensIn: number; tokensOut: number; insecure: boolean }> {
  const base = (cfg.baseUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('Не задан базовый URL провайдера')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Строгая проверка SSL; на машинах с антивирусом/прокси, подменяющим сертификат,
    // providerFetch сам повторит запрос с ослабленной проверкой (см. tls-fetch.ts)
    const { res, insecure } = await providerFetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: cfg.temperature,
        messages,
        ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (useJsonMode && res.status === 400 && /response_format|json/i.test(body)) {
        // провайдер не поддерживает json-режим — повторяем без него
        return chatCompletions(cfg, messages, timeoutMs, false)
      }
      if (res.status === 404) {
        // путь не найден — почти всегда неверный базовый URL (адрес сайта вместо адреса API)
        throw new Error(
          `Провайдер не нашёл адрес ${base}/chat/completions (HTTP 404). ` +
          'Проверьте базовый URL — это должен быть адрес API и обычно он заканчивается на /v1.',
        )
      }
      throw describeHttpStatus(res.status)
    }

    // Защита от HTML-страницы вместо JSON: неверный базовый URL (адрес сайта вместо API)
    // или страница-ошибка шлюза — иначе res.json() даёт невнятное «Unexpected token '<'»
    const ctype = res.headers.get('content-type') ?? ''
    if (!/json/i.test(ctype)) {
      const text = await res.text().catch(() => '')
      const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
      throw new Error(
        `Провайдер вернул HTML-страницу вместо JSON (HTTP ${res.status}). ` +
        `Проверьте базовый URL — это должен быть адрес API (например, https://api.aiai.by/v1), а не адрес сайта.` +
        (snippet ? ` Фрагмент ответа: «${snippet}»` : ''),
      )
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const raw = data.choices?.[0]?.message?.content ?? ''
    if (!raw) throw new Error('Провайдер вернул пустой ответ')
    return {
      raw,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
      insecure,
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('Таймаут запроса к провайдеру (90 секунд). Попробуйте ещё раз.')
    }
    if (e instanceof TypeError && /fetch/i.test((e as Error).message)) {
      throw new Error('Нет соединения с провайдером. Проверьте интернет или базовый URL.')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export function openAILike(code: string, defaultBaseUrl: string): LLMAdapter {
  return {
    code,
    async generate(cfg: ProviderConfig, system: string, user: string, opts?: GenerateOpts): Promise<LLMResult> {
      const cfg2: ProviderConfig = { ...cfg, baseUrl: cfg.baseUrl || defaultBaseUrl }
      const out = await chatCompletions(cfg2, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], opts?.timeoutMs ?? 90_000, true)
      return {
        raw: out.raw,
        tokensIn: out.tokensIn || estimateTokens(system + user),
        tokensOut: out.tokensOut || estimateTokens(out.raw),
        model: cfg.model,
      }
    },
    async test(cfg: ProviderConfig): Promise<TestResult> {
      const started = Date.now()
      try {
        const cfg2: ProviderConfig = { ...cfg, baseUrl: cfg.baseUrl || defaultBaseUrl, temperature: 0 }
        const out = await chatCompletions(cfg2, [
          { role: 'user', content: 'Верни ровно этот JSON без пояснений: {"ok":true}' },
        ], 30_000, true)
        return { ok: true, latencyMs: Date.now() - started, model: cfg.model, ...(out.insecure ? { insecure: true } : {}) }
      } catch (e) {
        return { ok: false, latencyMs: Date.now() - started, model: cfg.model, error: (e as Error).message }
      }
    },
  }
}
