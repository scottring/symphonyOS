// src/hooks/useFirstWeekSignals.ts
//
// Signals for the "Your first week" card, read from data the account already
// has — no new tables. Every count is a `head: true` select (see
// `src/lib/firstRun.ts` `loadFirstRunSignals` for the same pattern), run in
// parallel. Re-fetches on window focus / tab visibility because the flows
// that move these signals (Settings → household, the paper flow, Routines)
// live elsewhere on the page and can commit while Today is already mounted.

import { useCallback, useEffect, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import type { FirstWeekSignals } from '@/lib/firstWeek'

export function useFirstWeekSignals() {
  const [signals, setSignals] = useState<FirstWeekSignals | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const { data: { user } } = await getAuthUser()
    if (!user) {
      setSignals(null)
      setLoading(false)
      return
    }

    const nowIso = new Date().toISOString()
    const [members, attachments, householdMembers, invitations, routines] = await Promise.all([
      supabase.from('family_members').select('id', { count: 'exact', head: true }),
      // `useCommitPage` writes one `attachments` row per committed page at
      // `<uid>/page/<uuid>.ext` — the same signal for a sample page or a
      // real one, which is the point: either completes the step.
      supabase.from('attachments').select('id', { count: 'exact', head: true }).ilike('storage_path', '%/page/%'),
      supabase.from('household_members').select('id', { count: 'exact', head: true }),
      supabase.from('household_invitations').select('id', { count: 'exact', head: true }).gt('expires_at', nowIso),
      supabase.from('routines').select('id', { count: 'exact', head: true }),
    ])

    setSignals({
      memberCount: members.count ?? 0,
      pageCommitted: (attachments.count ?? 0) > 0,
      partnerInvited: (householdMembers.count ?? 0) >= 2 || (invitations.count ?? 0) >= 1,
      routineCount: routines.count ?? 0,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
    const onFocus = () => void refetch()
    const onVisible = () => { if (document.visibilityState === 'visible') void refetch() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refetch])

  return { signals, loading, refetch }
}
