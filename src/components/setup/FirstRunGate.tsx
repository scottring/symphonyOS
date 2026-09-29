import { useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { FirstRunSetup } from './FirstRunSetup'
import {
  isFirstRunDoneLocally,
  loadFirstRunSignals,
  markFirstRunDoneLocally,
  needsFirstRun,
} from '@/lib/firstRun'
import { getPendingJoin } from '@/lib/pendingJoin'

type Stage = 'checking' | 'setup' | 'ready'

/**
 * Sits between AuthGate and the Shell. A brand-new account sees the
 * household setup screen once; everyone else passes straight through. The
 * decision is cached per browser after the first check so returning users
 * pay for it only once.
 */
export function FirstRunGate({ user, children }: { user: User; children: ReactNode }) {
  const [stage, setStage] = useState<Stage>(() => {
    // Dev preview: localStorage.setItem('symphony.firstRun.force', '1') shows
    // the setup screen on any account without touching its data.
    if (import.meta.env.DEV && localStorage.getItem('symphony.firstRun.force') === '1') return 'setup'
    return isFirstRunDoneLocally(user.id) ? 'ready' : 'checking'
  })

  useEffect(() => {
    if (stage !== 'checking') return
    let live = true
    loadFirstRunSignals(user.id)
      .then((signals) => {
        if (!live) return
        if (needsFirstRun(signals)) {
          // Invited to a household: join it, rather than setting up a new one.
          const invite = getPendingJoin()
          if (invite) { window.location.replace(`/join/${invite}`); return }
          setStage('setup')
        } else {
          markFirstRunDoneLocally(user.id)
          setStage('ready')
        }
      })
      .catch((err) => {
        // Never lock someone out of the app over a failed check.
        console.warn('[first-run] check failed:', err)
        if (live) setStage('ready')
      })
    return () => { live = false }
  }, [stage, user.id])

  if (stage === 'checking') {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (stage === 'setup') {
    return (
      <FirstRunSetup
        user={user}
        onDone={() => {
          markFirstRunDoneLocally(user.id)
          // A new household lands on Plan with guidance — choose what to plan,
          // or "Explore on my own" — not on an empty Today (onboarding suite,
          // 2026-09-29). The shell mounts after this, so its router reads it.
          try { window.history.replaceState(null, '', '/start') } catch { /* not a browser */ }
          setStage('ready')
        }}
      />
    )
  }

  return <>{children}</>
}
