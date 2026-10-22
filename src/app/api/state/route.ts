import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettingsDTO } from '@/lib/lem/settings'

export async function GET() {
  const settings = await getSettingsDTO()
  const projectCount = await db.project.count()
  return NextResponse.json({ onboarded: settings.onboarded, provider: settings.provider, projectCount })
}
