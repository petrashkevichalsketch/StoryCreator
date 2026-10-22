// Серверный сервис настроек: единственная строка Setting (id=1),
// ключи провайдеров — только в шифрованном виде (FR-9.4)

import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from './crypto'
import { providerMeta } from './providers/meta'
import type { ProviderConfig } from './providers/types'
import type { ProviderCode, SettingsDTO } from './types'

export interface SettingsRow {
  provider: ProviderCode
  model: string
  temperature: number
  waveSize: number
  lemPauseSec: number
  baseUrls: Record<string, string>
  onboarded: boolean
}

export async function getSettingsRow() {
  let row = await db.setting.findUnique({ where: { id: 1 } })
  if (!row) {
    row = await db.setting.create({ data: { id: 1 } })
  }
  return row
}

export async function getSettings(): Promise<SettingsRow> {
  const row = await getSettingsRow()
  let baseUrls: Record<string, string> = {}
  try {
    baseUrls = JSON.parse(row.baseUrls || '{}')
  } catch {
    baseUrls = {}
  }
  return {
    provider: row.provider as ProviderCode,
    model: row.model,
    temperature: row.temperature,
    waveSize: row.waveSize,
    lemPauseSec: row.lemPauseSec,
    baseUrls,
    onboarded: row.onboarded,
  }
}

/** Публичный DTO: без ключей, только флаги «ключ сохранён» */
export async function getSettingsDTO(): Promise<SettingsDTO> {
  const s = await getSettings()
  const keys = await db.providerKey.findMany()
  const keyFlags: Record<string, boolean> = {}
  for (const k of keys) keyFlags[k.provider] = true
  return {
    provider: s.provider,
    model: s.model,
    temperature: s.temperature,
    waveSize: s.waveSize,
    lemPauseSec: s.lemPauseSec,
    baseUrls: s.baseUrls,
    onboarded: s.onboarded,
    keys: keyFlags,
  }
}

export async function saveKey(provider: string, apiKey: string | null | undefined): Promise<void> {
  if (apiKey === undefined) return
  if (apiKey === null || apiKey === '') {
    await db.providerKey.deleteMany({ where: { provider } })
    return
  }
  const keyEnc = encryptSecret(apiKey)
  await db.providerKey.upsert({
    where: { provider },
    create: { provider, keyEnc },
    update: { keyEnc },
  })
}

/** Конфиг провайдера для обращения к модели: ключ расшифровывается только в памяти */
export async function buildProviderConfig(code: string, overrides?: { model?: string; baseUrl?: string; apiKey?: string }): Promise<ProviderConfig> {
  const s = await getSettings()
  const meta = providerMeta(code)
  let apiKey: string | null = overrides?.apiKey ?? null
  if (!apiKey) {
    const stored = await db.providerKey.findUnique({ where: { provider: code } })
    if (stored) {
      try {
        apiKey = decryptSecret(stored.keyEnc)
      } catch {
        apiKey = null
      }
    }
  }
  return {
    apiKey,
    baseUrl: overrides?.baseUrl || s.baseUrls[code] || meta?.baseUrl || null,
    model: overrides?.model || s.model || meta?.defaultModel || '',
    temperature: s.temperature,
  }
}
