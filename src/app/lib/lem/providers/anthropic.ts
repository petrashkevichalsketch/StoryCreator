// Адаптер Anthropic Claude — аутентификация заголовком x-api-key (таблица 5 ТЗ)

import { describeHttpStatus, estimateTokens, type GenerateOpts, type LLMAdapter, type LLMResult, type ProviderConfig, type TestResult } from './types'

const DEFAULT_BASE = 'https://api.anthropic.com/v1'

export const anthropicAdapter: LLMAdapter = {
  code: 'anthropic',
  async generate(cfg: ProviderConfig, system: string, user: string, opts?: GenerateOpts): Promise<LLMResult> {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 90_000)
    try {
      const res = await fetch(`${base}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          // Anthropic допускает temperature не выше 1
          temperature: Math.min(cfg.temperature, 1),
          max_tokens: 4096,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      })
      if (!res.ok) throw describeHttpStatus(res.status)
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[]
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      const raw = data.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('') ?? ''
      if (!raw) throw new Error('Провайдер вернул пустой ответ')
      return {
        raw,
        tokensIn: data.usage?.input_tokens ?? estimateTokens(system + user),
        tokensOut: data.usage?.output_tokens ?? estimateTokens(raw),
        model: cfg.model,
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error('Таймаут запроса к провайдеру (90 секунд). Попробуйте ещё раз.')
      if (e instanceof TypeError && /fetch/i.test((e as Error).message)) throw new Error('Нет соединения с провайдером. Проверьте интернет.')
      throw e
    } finally {
      clearTimeout(timer)
    }
  },
  async test(cfg: ProviderConfig): Promise<TestResult> {
    const started = Date.now()
    try {
      const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)
      const res = await fetch(`${base}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 32,
          messages: [{ role: 'user', content: 'Верни ровно этот JSON без пояснений: {"ok":true}' }],
        }),
      })
      clearTimeout(timer)
      if (!res.ok) throw describeHttpStatus(res.status)
      await res.json()
      return { ok: true, latencyMs: Date.now() - started, model: cfg.model }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - started, model: cfg.model, error: (e as Error).message }
    }
  },
}
