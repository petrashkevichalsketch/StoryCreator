'use client'

import { useEffect } from 'react'
import { useLemStore } from '@/lib/store'
import { Onboarding } from '@/components/lem/onboarding'
import { Library } from '@/components/lem/library'
import { Constructor } from '@/components/lem/constructor'
import { SettingsScreen } from '@/components/lem/settings-screen'

/**
 * «Калькулятор Лема» — единый маршрут приложения.
 * Экраны (онбординг, библиотека, конструктор, настройки) управляются
 * состоянием Zustand в соответствии с пользовательским сценарием ТЗ.
 */
export default function Home() {
  const screen = useLemStore((s) => s.screen)
  const bootstrap = useLemStore((s) => s.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (screen === 'loading') {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          { }
          <img src="/lem-icon.svg" alt="Калькулятор Лема" className="h-10 w-10 rounded-xl animate-pulse" />
          <p className="text-[13px] text-muted-foreground">Калькулятор считает…</p>
        </div>
      </main>
    )
  }

  if (screen === 'onboarding') return <Onboarding />
  if (screen === 'settings') return <SettingsScreen />
  if (screen === 'constructor') return <Constructor />
  return <Library />
}
