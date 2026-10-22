// Шифрование API-ключей: AES-256-GCM.
// Аналог DPAPI из ТЗ (FR-9.4): ключ никогда не возвращается браузеру
// и не попадает в логи; машинный ключ хранится отдельно от базы.

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const KEY_FILE = path.join(process.cwd(), 'db', 'lem.key')

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  try {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim()
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      cachedKey = Buffer.from(hex, 'hex')
      return cachedKey
    }
  } catch {
    // файла нет — создадим ниже
  }
  const fresh = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true })
  fs.writeFileSync(KEY_FILE, fresh.toString('hex'), { mode: 0o600 })
  cachedKey = fresh
  return cachedKey
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(enc: string): string {
  const buf = Buffer.from(enc, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
