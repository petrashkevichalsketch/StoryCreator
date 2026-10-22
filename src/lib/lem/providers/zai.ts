// Встроенная модель Z.ai через z-ai-web-dev-sdk — работает без API-ключа.
// Используется только на сервере.

import type { GenerateOpts, LLMAdapter, LLMResult, ProviderConfig, TestResult } from './types'
import { estimateTokens } from './types'

export const zaiAdapter: LLMAdapter = {
  code: 'zai',
  async generate(cfg: ProviderConfig, system: string, user: string, opts?: GenerateOpts): Promise<LLMResult> {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system },
        { role: 'user', content: user },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices?.[0]?.message?.content ?? ''
    if (!raw.trim()) throw new Error('Встроенная модель вернула пустой ответ')
    const usage = (completion as unknown as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
    return {
      raw,
      tokensIn: usage?.prompt_tokens ?? estimateTokens(system + user),
      tokensOut: usage?.completion_tokens ?? estimateTokens(raw),
      model: cfg.model,
    }
  },
  async test(_cfg: ProviderConfig): Promise<TestResult> {
    const started = Date.now()
    try {
      const { default: ZAI } = await import('z-ai-web-dev-sdk')
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'user', content: 'Верни ровно этот JSON без пояснений: {"ok":true}' }],
        thinking: { type: 'disabled' },
      })
      const raw = completion.choices?.[0]?.message?.content ?? ''
      if (!raw.trim()) throw new Error('Встроенная модель вернула пустой ответ')
      return { ok: true, latencyMs: Date.now() - started, model: _cfg.model }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - started, model: _cfg.model, error: (e as Error).message }
    }
  },
}
