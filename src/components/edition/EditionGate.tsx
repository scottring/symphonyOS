import { useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { LightHoldingPage } from './LightHoldingPage'
import { isFullRememberedLocally, loadEdition, rememberFullLocally } from '@/lib/edition'

type Stage = 'checking' | 'light' | 'ready'

/**
 * Sits between AuthGate and the rest of the web app. A light account sees one
 * holding page; everyone else passes through. Only a 'full' answer is
 * remembered per browser, so an upgrade shows on the next load. A failed
 * lookup shows the app: the server is the enforcement.
 */
export function EditionGate({ user, signOut, children }: {
  user: User
  signOut: () => Promise<unknown>
  children: ReactNode
}) {
  const [stage, setStage] = useState<Stage>(() => {
    // A paired display (anonymous sign-in) has no household edition.
    if (user.is_anonymous) return 'ready'
    return isFullRememberedLocally(user.id) ? 'ready' : 'checking'
  })

  useEffect(() => {
    if (stage !== 'checking') return
    let live = true
    loadEdition().then((edition) => {
      if (!live) return
      if (edition === 'light') { setStage('light'); return }
      if (edition === 'full') rememberFullLocally(user.id)
      setStage('ready')
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
  if (stage === 'light') return <LightHoldingPage email={user.email} onSignOut={() => { void signOut() }} />
  return <>{children}</>
}
