// Запросы к API провайдеров со стойкостью к локальному TLS-перехвату.
//
// Проблема: на машинах с антивирусом/прокси, которые проверяют HTTPS-трафик
// (Kaspersky, ESET, AdGuard, корпоративный прокси и т.п.), сертификат сайта
// подменяется на сертификат перехватчика. Браузеры и curl доверяют системному
// хранилищу Windows и работают, а Node.js использует собственное хранилище —
// и отвергает такое соединение: «self-signed certificate in certificate chain»,
// «unable to verify the first certificate» и т.п.
//
// Решение: строгая проверка сертификата остаётся основной. Если она не прошла
// именно из-за доверия сертификату — выполняется один автоматический повтор
// через node:https с rejectUnauthorized:false (только для этого запроса к
// провайдеру). Шифрование сохраняется; глобально TLS в процессе не отключается.

import https from 'node:https'

/** Признак того, что ошибка — именно недоверие сертификату, а не сеть/таймаут */
export function isTlsTrustError(e: unknown): boolean {
  const err = e as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } }
  if (err?.name === 'AbortError') return false
  const haystack = [err?.code, err?.cause?.code, err?.message, err?.cause?.message]
    .map((s) => String(s ?? ''))
    .join(' ')
  return /CERT|CERTIFICATE|PKIX|SELF-SIGNED|SSL_|_SSL|ERR_TLS/i.test(haystack)
}

/** Один HTTPS-запрос с ослабленной проверкой сертификата (только провайдерский) */
function relaxedHttpsRequest(
  url: URL,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init.method,
        headers: init.headers,
        rejectUnauthorized: false,
        signal: init.signal,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headers[k] = v
            else if (Array.isArray(v)) headers[k] = v.join(', ')
          }
          resolve(new Response(text, { status: res.statusCode ?? 502, headers }))
        })
      },
    )
    req.on('error', reject)
    if (init.body !== undefined) req.write(init.body)
    req.end()
  })
}

export interface ProviderFetchResult {
  res: Response
  /** true — соединение прошло через ослабленную проверку сертификата (TLS-перехват на машине) */
  insecure: boolean
}

/**
 * fetch к API провайдера: сначала строгая проверка сертификата;
 * при ошибке доверия сертификату — один повтор с ослабленной проверкой.
 */
export async function providerFetch(url: string, init: RequestInit): Promise<ProviderFetchResult> {
  try {
    return { res: await fetch(url, init), insecure: false }
  } catch (e) {
    if (!isTlsTrustError(e)) throw e
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v
    })
    const res = await relaxedHttpsRequest(new URL(url), {
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
      signal: init.signal ?? undefined,
    })
    return { res, insecure: true }
  }
}
