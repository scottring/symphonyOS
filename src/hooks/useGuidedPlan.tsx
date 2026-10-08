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
  try {
    const { error } = await supabase.from('user_profiles').upsert(
      { user_id: uid, guided_plan: s, updated_at: new Date().toISOString() }, { onConflict: 'user_id' },
    )
    return !error
  } catch { return false }
}

async function readRemote(uid: string): Promise<{ data: unknown; error: unknown }> {
  try {
    return await supabase.from('user_profiles').select('guided_plan').eq('user_id', uid).maybeSingle()
  } catch (error) { return { data: null, error } }
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

  // Every change to this browser's copy bumps `version`. `synced` is the
  // version last confirmed in the account. All account reads-then-writes run
  // one at a time on `queue`, and a write always sends this browser's CURRENT
  // copy, so an older save can never land after a newer one, and a success is
  // only reported as 'account' when nothing newer has happened since.
  const version = useRef(0)
  const synced = useRef(-1)
  // This browser's current copy, held in memory. Browser storage is only a
  // best-effort backup for the next visit: a full or blocked storage must
  // never make a flush send (or reconcile compare) an older copy than the one
  // on screen.
  const latest = useRef<Stored | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const enqueue = useCallback((op: () => Promise<void>) => {
    const run = queue.current.then(op)
    queue.current = run.catch(() => { /* a failed op must not stall the queue */ })
    return run
  }, [])

  /** Send this browser's copy to the account (skipped if already there). */
  const flush = useCallback(async (forUid: string) => {
    if (current.current !== forUid) return
    const v = version.current
    if (synced.current === v) { setSavedIn('account'); return }
    const local = latest.current
    if (!local) return
    const ok = await writeRemote(forUid, local)
    if (current.current !== forUid) return
    if (ok && synced.current < v) synced.current = v
    // A newer change made during the write has its own flush queued behind
    // this one; until it lands, the shown copy is only in this browser.
    setSavedIn(ok && version.current === v ? 'account' : 'device')
  }, [])

  // Bring this browser and the account to the same, newest copy: read the
  // account, keep whichever is newer, and write it to whichever side is behind.
  // Runs on sign-in, and again on reconnect or returning to the tab, so a
  // failed write is retried and another device's change is picked up.
  const reconcile = useCallback(async (forUid: string) => {
    const { data, error } = await readRemote(forUid)
    if (current.current !== forUid) return
    // Take this browser's copy after the fetch: a set() made while it was in
    // flight counts.
    const local = latest.current
    if (error) {
      setState(shown(local)); setSavedIn('device'); setLoaded(true)
      return
    }
    const remote = parseStored((data as { guided_plan?: unknown } | null)?.guided_plan ?? null)
    const winner = newerOf(remote, local)
    if (winner && local && winner.updatedAt === local.updatedAt) {
      // Same change on both sides (or this browser's is newer): keep ours.
    } else if (winner !== local) {
      latest.current = winner
      writeLocal(forUid, winner)
      version.current++
      setState(shown(winner))
    }
    setLoaded(true)
    if (!winner || (remote && winner.updatedAt === remote.updatedAt)) {
      synced.current = version.current
      setSavedIn('account')
      return
    }
    await flush(forUid)
  }, [flush])

  useEffect(() => {
    setState(null); setLoaded(false); setSavedIn('device')
    version.current = 0; synced.current = -1; latest.current = null
    if (!uid) return
    latest.current = readLocal(uid)
    setState(shown(latest.current))
    void enqueue(() => reconcile(uid))
    const again = () => { if (document.visibilityState === 'visible') void enqueue(() => reconcile(uid)) }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [uid, reconcile, enqueue])

  const set = useCallback(async (next: GuideState | null) => {
    if (!uid) return
    const stored: Stored = next ?? { v: 1, cleared: true, updatedAt: new Date().toISOString() }
    setState(next)
    latest.current = stored
    writeLocal(uid, stored)
    version.current++
    setSavedIn('device')
    await enqueue(() => flush(uid))
  }, [uid, enqueue, flush])

  const api = useMemo(() => ({ state, loaded, savedIn, set }), [state, loaded, savedIn, set])
  return <GuideContext.Provider value={api}>{children}</GuideContext.Provider>
}

/** The shell's guided-planning progress; a quiet no-op outside the provider. */
export function useGuidedPlan(): GuideApi {
  return useContext(GuideContext) ?? { state: null, loaded: true, savedIn: 'device', set: async () => {} }
}
