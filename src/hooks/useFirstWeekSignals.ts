// src/hooks/useFirstWeekSignals.ts
//
// Signals for the "Your first week" card, read from data the account already
// has — no new tables. Every count is a `head: true` select (see
// `src/lib/firstRun.ts` `loadFirstRunSignals` for the same pattern), run in
// parallel. Re-fetches on window focus / tab visibility because the flows
// that move these signals (Settings → household, the paper flow, Routines)
// live elsewhere on the page and can commit while Today is already mounted.
//
// Two things this file is careful about.
//
// SCOPE. `household_members` and `household_invitations` hand out rows beyond
// the current account — the invitations select policy is `using (true)` — so
// an unfiltered `count` is the whole platform's rows, not yours. A brand-new
// account read "Invite your partner — invited" off strangers' invitations.
// Both counts are scoped to the caller's own household here.
//
// COST. The card retires for good once fewer than two steps remain
// (`shouldShowFirstWeek`), so polling past that point buys nothing and every
// established account was paying five count queries on every window focus,
// forever. Once the loaded signals say the card is done, the focus and
// visibility listeners come off. An explicit `refetch()` still works — that's
// how clearing the sample page brings the card (and the listeners) back.

import { useCallback, useEffect, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { firstWeekSteps, type FirstWeekSignals } from '@/lib/firstWeek'

export function useFirstWeekSignals() {
  const [signals, setSignals] = useState<FirstWeekSignals | null>(null)
  const [loading, setLoading] = useState(true)
  // The card is done with this account — stop listening.
  const [settled, setSettled] = useState(false)

  const refetch = useCallback(async () => {
    const { data: { user } } = await getAuthUser()
    if (!user) {
      setSignals(null)
      setLoading(false)
      return
    }

    const nowIso = new Date().toISOString()
    const [members, attachments, ownRow, invitations, routines] = await Promise.all([
      supabase.from('family_members').select('id', { count: 'exact', head: true }),
      // `useCommitPage` writes one `attachments` row per committed page at
      // `<uid>/page/<uuid>.ext` — the same signal for a sample page or a
      // real one, which is the point: either completes the step.
      supabase.from('attachments').select('id', { count: 'exact', head: true }).ilike('storage_path', '%/page/%'),
      // OUR household, not a global count (see SCOPE above).
      supabase.from('household_members').select('household_id').eq('user_id', user.id).limit(1).maybeSingle(),
      // Invitations WE sent that are still open. Unfiltered, this counted
      // every live invitation in the database.
      supabase.from('household_invitations').select('id', { count: 'exact', head: true })
        .eq('invited_by', user.id).is('accepted_at', null).gt('expires_at', nowIso),
      supabase.from('routines').select('id', { count: 'exact', head: true }),
    ])

    const householdId = (ownRow.data as { household_id?: string | null } | null)?.household_id ?? null
    const householdCount = householdId
      ? (await supabase.from('household_members').select('id', { count: 'exact', head: true }).eq('household_id', householdId)).count ?? 0
      : 0

    const next: FirstWeekSignals = {
      memberCount: members.count ?? 0,
      pageCommitted: (attachments.count ?? 0) > 0,
      partnerInvited: householdCount >= 2 || (invitations.count ?? 0) >= 1,
      routineCount: routines.count ?? 0,
    }
    setSignals(next)
    // Mirrors `shouldShowFirstWeek`'s "≥2 undone steps" rule: below it the
    // card never shows again, so there is nothing left to watch for.
    setSettled(firstWeekSteps(next).filter((s) => !s.done).length < 2)
    setLoading(false)
  }, [])

  useEffect(() => { void refetch() }, [refetch])

  useEffect(() => {
    if (settled) return
    const onFocus = () => void refetch()
    const onVisible = () => { if (document.visibilityState === 'visible') void refetch() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refetch, settled])

  return { signals, loading, refetch }
}
