// Адаптер локального Ollama — без ключа, полностью офлайн (таблица 5 ТЗ)

import { estimateTokens, type GenerateOpts, type LLMAdapter, type LLMResult, type ProviderConfig, type TestResult } from './types'

const DEFAULT_BASE = 'http://localhost:11434'

export const ollamaAdapter: LLMAdapter = {
  code: 'ollama',
  async generate(cfg: ProviderConfig, system: string, user: string, opts?: GenerateOpts): Promise<LLMResult> {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 90_000)
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          options: { temperature: cfg.temperature },
        }),
      })
      if (!res.ok) throw new Error(`Ollama вернула ошибку ${res.status}. Проверьте, что модель «${cfg.model}» загружена (ollama pull).`)
      const data = (await res.json()) as {
        message?: { content?: string }
        prompt_eval_count?: number
        eval_count?: number
      }
      const raw = data.message?.content ?? ''
      if (!raw) throw new Error('Ollama вернула пустой ответ')
      return {
        raw,
        tokensIn: data.prompt_eval_count ?? estimateTokens(system + user),
        tokensOut: data.eval_count ?? estimateTokens(raw),
        model: cfg.model,
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error('Таймаут запроса к Ollama (90 секунд). Локальная модель может быть не загружена.')
      if (e instanceof TypeError && /fetch/i.test((e as Error).message)) {
        throw new Error('Не удалось подключиться к Ollama на localhost:11434. Запустите Ollama и повторите.')
      }
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
      const timer = setTimeout(() => controller.abort(), 15_000)
      const res = await fetch(`${base}/api/tags`, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`Ollama вернула ошибку ${res.status}`)
      const data = (await res.json()) as { models?: { name?: string }[] }
      const names = (data.models ?? []).map((m) => m.name ?? '')
      if (names.length && !names.some((n) => n === cfg.model || n.split(':')[0] === cfg.model.split(':')[0])) {
        return { ok: false, latencyMs: Date.now() - started, model: cfg.model, error: `Модель «${cfg.model}» не найдена. Доступны: ${names.slice(0, 5).join(', ')}` }
      }
      return { ok: true, latencyMs: Date.now() - started, model: cfg.model }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - started, model: cfg.model, error: 'Не удалось подключиться к Ollama на localhost:11434. Запустите Ollama и повторите.' }
    }
  },
}
