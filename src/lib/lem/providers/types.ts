// Единый внутренний интерфейс адаптеров (раздел 6.1 ТЗ):
// ядро сюжета не знает, какой провайдер выбран.

export interface ProviderConfig {
  apiKey?: string | null
  baseUrl?: string | null
  model: string
  temperature: number
}

export interface LLMResult {
  raw: string
  tokensIn: number
  tokensOut: number
  model: string
}

export interface WaveSpec {
  category: string
  premise?: string | null
  act: string
  actFocus: string
  level: number
  n: number
  lem: boolean
  path: { level: number; title: string; description: string; consequences: string }[]
  excludedTitles: string[]
}

export interface GenerateOpts {
  timeoutMs?: number
  /** структурированные данные волны; используются демо-адаптером */
  wave?: WaveSpec
}

export interface TestResult {
  ok: boolean
  latencyMs: number
  model: string
  error?: string
  /** true — соединение выполнено в обход строгой проверки SSL (антивирус/прокси подменяет сертификат) */
  insecure?: boolean
}

export interface LLMAdapter {
  code: string
  generate(cfg: ProviderConfig, system: string, user: string, opts?: GenerateOpts): Promise<LLMResult>
  test(cfg: ProviderConfig): Promise<TestResult>
}

/** Оценка числа токенов, когда провайдер не отдаёт usage */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5))
}

export class ProviderError extends Error {
  status: 'network' | 'auth' | 'rate' | 'server' | 'bad_request'
  constructor(status: ProviderError['status'], message: string) {
    super(message)
    this.status = status
  }
}

export function describeHttpStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('auth', 'Неверный или непринятый API-ключ провайдера.')
  if (status === 429) return new ProviderError('rate', 'Провайдер перегружен, подождите минуту и повторите.')
  if (status === 400) return new ProviderError('bad_request', 'Провайдер отклонил запрос (проверьте модель и ключ).')
  if (status >= 500) return new ProviderError('server', 'Провайдер перегружен, подождите минуту и повторите.')
  return new ProviderError('server', `Провайдер вернул ошибку ${status}.`)
}

export function isNetworkError(e: unknown): boolean {
  if (e instanceof ProviderError) return e.status === 'network'
  const msg = String((e as Error)?.message ?? e)
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|abort|network|socket/i.test(msg)
}
