import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { EditionGate } from './EditionGate'

/**
 * For routes outside AuthGate (the kitchen wall, the kid screens), which must
 * stay reachable signed out to pair a display. While auth loads, with no user,
 * or for an anonymous user (a paired display), the children render as they
 * always have; a signed-in person goes through EditionGate, so a light
 * account gets the holding page here too.
 */
export function EditionGateIfSignedIn({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth()
  if (loading || !user || user.is_anonymous) return <>{children}</>
  return <EditionGate key={user.id} user={user} signOut={signOut}>{children}</EditionGate>
}
