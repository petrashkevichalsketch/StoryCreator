import { NextResponse } from 'next/server'
import { PROVIDERS } from '@/lib/lem/providers/meta'

export async function GET() {
  return NextResponse.json({ providers: PROVIDERS })
}
