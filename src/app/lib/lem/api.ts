// Вспомогательные функции REST API

import { NextResponse } from 'next/server'
import { WaveError } from './wave'

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export function waveErrorResponse(e: unknown) {
  if (e instanceof WaveError) {
    const status = e.kind === 'provider' ? 502 : e.kind === 'invalid' ? 422 : 400
    return NextResponse.json(
      { error: e.message, kind: e.kind, raw: e.raw },
      { status }
    )
  }
  const message = (e as Error)?.message ?? 'Внутренняя ошибка сервера'
  return NextResponse.json({ error: message, kind: 'unknown' }, { status: 500 })
}

/** Имя файла в Content-Disposition с кириллицей */
export function contentDisposition(filename: string): string {
  return `attachment; filename="export"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
