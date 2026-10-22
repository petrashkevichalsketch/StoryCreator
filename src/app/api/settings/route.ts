import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettingsDTO, saveKey, getSettingsRow } from '@/lib/lem/settings'
import { providerMeta } from '@/lib/lem/providers/meta'

export async function GET() {
  const dto = await getSettingsDTO()
  return NextResponse.json(dto)
}

const VALID_PROVIDERS = ['openai', 'anthropic', 'glm', 'deepseek', 'ollama', 'aiai', 'zai', 'demo']

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 })

  const row = await getSettingsRow()
  const data: Record<string, unknown> = { updatedAt: new Date() }

  if (typeof body.provider === 'string' && VALID_PROVIDERS.includes(body.provider)) {
    data.provider = body.provider
    const meta = providerMeta(body.provider)
    // при смене провайдера модель сбрасывается на модель по умолчанию,
    // если текущая не принадлежит новому провайдеру
    if (meta && !meta.models.includes(row.model)) data.model = meta.defaultModel
  }
  if (typeof body.model === 'string') data.model = body.model.trim().slice(0, 120)
  if (typeof body.temperature === 'number') {
    if (body.temperature < 0.2 || body.temperature > 1.2) {
      return NextResponse.json({ error: 'Температура допускается в диапазоне 0,2–1,2' }, { status: 400 })
    }
    data.temperature = body.temperature
  }
  if (typeof body.waveSize === 'number') {
    if (!Number.isInteger(body.waveSize) || body.waveSize < 5 || body.waveSize > 10) {
      return NextResponse.json({ error: 'Размер волны — от 5 до 10 карточек' }, { status: 400 })
    }
    data.waveSize = body.waveSize
  }
  if (typeof body.lemPauseSec === 'number') {
    if (body.lemPauseSec < 1 || body.lemPauseSec > 5) {
      return NextResponse.json({ error: 'Пауза режима Лема — от 1 до 5 секунд' }, { status: 400 })
    }
    data.lemPauseSec = Math.round(body.lemPauseSec)
  }
  if (body.baseUrls && typeof body.baseUrls === 'object') {
    const current = JSON.parse(row.baseUrls || '{}') as Record<string, string>
    const incoming = body.baseUrls as Record<string, unknown>
    const next: Record<string, string> = { ...current }
    for (const [code, url] of Object.entries(incoming)) {
      if (!VALID_PROVIDERS.includes(code)) continue
      if (typeof url === 'string' && url.trim()) next[code] = url.trim()
    }
    data.baseUrls = JSON.stringify(next)
  }
  if (typeof body.onboarded === 'boolean') data.onboarded = body.onboarded

  // Ключи шифруются на сервере и никогда не возвращаются браузеру (FR-9.4)
  if (typeof body.apiKey === 'string' || body.apiKey === null) {
    const provider = (typeof body.provider === 'string' ? body.provider : row.provider) as string
    await saveKey(provider, body.apiKey as string | null)
  }
  if (body.keys && typeof body.keys === 'object') {
    for (const [provider, key] of Object.entries(body.keys as Record<string, unknown>)) {
      if (!VALID_PROVIDERS.includes(provider)) continue
      if (typeof key === 'string' || key === null) await saveKey(provider, key as string | null)
    }
  }

  await db.setting.update({ where: { id: 1 }, data })
  return NextResponse.json(await getSettingsDTO())
}
