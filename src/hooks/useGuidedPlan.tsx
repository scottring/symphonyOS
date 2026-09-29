// src/hooks/useGuidedPlan.tsx
//
// Guided planning progress for the signed-in person: one shared instance for
// the shell (guide bar, Today's resume line, the welcome page). Saved to
// user_profiles.guided_plan so Resume works on any device; this browser's
// storage is the fallback while that column is missing or a write fails, and
// the newer of the two wins on load. Per user: switching accounts never shows
// another person's progress.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { parseGuideState, type GuideState } from '@/lib/guide/guidedPlan'

const key = (uid: string) => `symphony.guide.${uid}`

function readLocal(uid: string): GuideState | null {
  try { const raw = localStorage.getItem(key(uid)); return raw ? parseGuideState(JSON.parse(raw)) : null } catch { return null }
}
function writeLocal(uid: string, s: GuideState | null) {
  try { if (s) localStorage.setItem(key(uid), JSON.stringify(s)); else localStorage.removeItem(key(uid)) } catch { /* private mode */ }
}

interface GuideApi {
  state: GuideState | null
  loaded: boolean
  /** Where progress lives: 'account' (any device) or 'device' (this browser only). */
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

  useEffect(() => {
    setState(null); setLoaded(false)
    if (!uid) return
    const local = readLocal(uid)
    setState(local)
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from('user_profiles').select('guided_plan').eq('user_id', uid).maybeSingle()
      if (cancelled || current.current !== uid) return
      if (!error) {
        setSavedIn('account')
        const remote = parseGuideState((data as { guided_plan?: unknown } | null)?.guided_plan ?? null)
        const newer = !local ? remote : !remote ? local : (remote.updatedAt > local.updatedAt ? remote : local)
        setState(newer)
      }
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [uid])

  const set = useCallback(async (next: GuideState | null) => {
    if (!uid) return
    setState(next)
    writeLocal(uid, next)
    const { error } = await supabase.from('user_profiles').upsert(
      { user_id: uid, guided_plan: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' },
    )
    setSavedIn(error ? 'device' : 'account')
  }, [uid])

  const api = useMemo(() => ({ state, loaded, savedIn, set }), [state, loaded, savedIn, set])
  return <GuideContext.Provider value={api}>{children}</GuideContext.Provider>
}

/** The shell's guided-planning progress; a quiet no-op outside the provider. */
export function useGuidedPlan(): GuideApi {
  return useContext(GuideContext) ?? { state: null, loaded: true, savedIn: 'device', set: async () => {} }
}
