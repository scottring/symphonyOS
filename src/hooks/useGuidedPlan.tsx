// src/hooks/useGuidedPlan.tsx
//
// Guided planning progress for the signed-in person: one shared instance for
// the shell (guide bar, Today's resume line, the welcome page). Saved to
// user_profiles.guided_plan so Resume works on any device; this browser's
// storage is the fallback while a write fails, and the newer of the two wins
// and is written back to the other (on load, reconnect, and tab return). Per user: switching accounts never shows
// another person's progress.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { parseGuideState, type GuideState } from '@/lib/guide/guidedPlan'

const key = (uid: string) => `symphony.guide.${uid}`

/** "Stop guiding", dated like any other change, so a stop on one device beats
 *  an older guide still sitting in another browser. Never shown: it reads as
 *  no guide. Older clients parse it as no guide too. */
interface Cleared { v: 1; cleared: true; updatedAt: string }
type Stored = GuideState | Cleared

const isCleared = (s: Stored | null): s is Cleared => !!s && (s as Cleared).cleared === true
const shown = (s: Stored | null): GuideState | null => (isCleared(s) ? null : s)

function parseStored(raw: unknown): Stored | null {
  const c = raw as Partial<Cleared> | null
  if (c && c.v === 1 && c.cleared === true && typeof c.updatedAt === 'string') return { v: 1, cleared: true, updatedAt: c.updatedAt }
  return parseGuideState(raw)
}

/** The newer of two copies; one that exists beats one that doesn't. */
function newerOf(a: Stored | null, b: Stored | null): Stored | null {
  if (!a) return b
  if (!b) return a
  return b.updatedAt > a.updatedAt ? b : a
}

function readLocal(uid: string): Stored | null {
  try { const raw = localStorage.getItem(key(uid)); return raw ? parseStored(JSON.parse(raw)) : null } catch { return null }
}
function writeLocal(uid: string, s: Stored | null) {
  try { if (s) localStorage.setItem(key(uid), JSON.stringify(s)); else localStorage.removeItem(key(uid)) } catch { /* private mode */ }
}

async function writeRemote(uid: string, s: Stored): Promise<boolean> {
  const { error } = await supabase.from('user_profiles').upsert(
    { user_id: uid, guided_plan: s, updated_at: new Date().toISOString() }, { onConflict: 'user_id' },
  )
  return !error
}

interface GuideApi {
  state: GuideState | null
  loaded: boolean
  /** Where progress lives: 'account' (any device) or 'device' (this browser
   *  only). 'account' only once the shown progress is actually stored there. */
  savedIn: 'account' | 'device'
  set: (next: GuideState | null) => Promise<void>
}

const GuideContext = createContext<GuideApi | null>(null)

export function GuideProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const [state, setState] = useState<GuideState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [savedIn, setSavedIn] = useState<'account' | 'device'>('device')
  const current = useRef<string | null>(uid)
  useEffect(() => { current.current = uid }, [uid])

  // Bring this browser and the account to the same, newest copy: read the
  // account, keep whichever is newer, and write it to whichever side is behind.
  // Runs on sign-in, and again on reconnect or returning to the tab, so a
  // failed write is retried and another device's change is picked up.
  const reconcile = useCallback(async (forUid: string) => {
    const { data, error } = await supabase.from('user_profiles').select('guided_plan').eq('user_id', forUid).maybeSingle()
    if (current.current !== forUid) return
    // Read local after the fetch: a set() made while it was in flight wins.
    const local = readLocal(forUid)
    if (error) {
      setState(shown(local)); setSavedIn('device'); setLoaded(true)
      return
    }
    const remote = parseStored((data as { guided_plan?: unknown } | null)?.guided_plan ?? null)
    const winner = newerOf(remote, local)
    if (winner !== local) writeLocal(forUid, winner)
    setState(shown(winner))
    setLoaded(true)
    if (!winner || winner === remote) { setSavedIn('account'); return }
    const ok = await writeRemote(forUid, winner)
    if (current.current === forUid) setSavedIn(ok ? 'account' : 'device')
  }, [])

  useEffect(() => {
    setState(null); setLoaded(false); setSavedIn('device')
    if (!uid) return
    setState(shown(readLocal(uid)))
    void reconcile(uid)
    const again = () => { if (document.visibilityState === 'visible') void reconcile(uid) }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [uid, reconcile])

  const set = useCallback(async (next: GuideState | null) => {
    if (!uid) return
    const stored: Stored = next ?? { v: 1, cleared: true, updatedAt: new Date().toISOString() }
    setState(next)
    writeLocal(uid, stored)
    const ok = await writeRemote(uid, stored)
    if (current.current === uid) setSavedIn(ok ? 'account' : 'device')
  }, [uid])

  const api = useMemo(() => ({ state, loaded, savedIn, set }), [state, loaded, savedIn, set])
  return <GuideContext.Provider value={api}>{children}</GuideContext.Provider>
}

/** The shell's guided-planning progress; a quiet no-op outside the provider. */
export function useGuidedPlan(): GuideApi {
  return useContext(GuideContext) ?? { state: null, loaded: true, savedIn: 'device', set: async () => {} }
}
