// src/hooks/useUnreviewedCaptures.ts
//
// Email captures the extractor has already turned into rows, that nobody has
// looked at yet.
//
// The commit policy for forwarded school mail is "auto-place, review after":
// a dated, confident event lands on its day the moment the email arrives, so
// by the time anyone opens Today the work is already there. That is the whole
// promise — but it also means a wrong guess is on the calendar unannounced.
// This hook is the census behind the quiet "New from email" door: what
// arrived, and has not been looked at.
//
// It is deliberately a COUNT-FREE census. Today never shows a tally (see
// TodayBacklogFooter), so callers use `captures.length > 0` as a gate and
// nothing else.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { showToast } from '@/hooks/useToast'

export interface UnreviewedCapture {
  id: string
  subject: string | null
  sourceLabel: string | null
  createdAt: Date
}

interface CaptureRow {
  id: string
  subject: string | null
  source_label: string | null
  created_at: string
}

/**
 * Newest first, capped. The cap is not a display limit so much as a bound on
 * a household that forwards mail and never opens the sheet — the review path
 * must stay one glance, never a landfill (the "School pool" mistake).
 */
const LIMIT = 10

export function useUnreviewedCaptures() {
  const [captures, setCaptures] = useState<UnreviewedCapture[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    // RLS scopes this to the household (captures_household_read), so there is
    // no user/household filter here on purpose — adding one would silently
    // hide a capture the partner forwarded.
    const { data } = await supabase
      .from('captures')
      .select('id, subject, source_label, created_at')
      .eq('kind', 'email')
      .eq('status', 'extracted')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    const rows = (data ?? []) as CaptureRow[]
    setCaptures(rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      sourceLabel: row.source_label,
      createdAt: new Date(row.created_at),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // Email arrives while the tab sits open — the same reason Today refetches
  // calendar events on tab return rather than polling. No realtime channel:
  // this is a once-a-day trickle, not a stream.
  useRefreshOnVisible(() => { void refresh() })

  /**
   * Stamp `reviewed_at` so these never reappear behind the footer link.
   *
   * Optimism is withheld until the write lands. A rejected UPDATE (an expired
   * JWT, a capture from outside the household) used to be invisible: the link
   * vanished, the row stayed unreviewed, and the door came back on the next
   * mount with no explanation. Keeping the rows on failure is the honest state.
   */
  const markReviewed = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const { error } = await supabase
      .from('captures')
      .update({ reviewed_at: new Date().toISOString() })
      .in('id', ids)
    if (error) {
      showToast('Could not mark that as reviewed', 'error', 4000)
      return
    }
    setCaptures((prev) => prev.filter((c) => !ids.includes(c.id)))
  }, [])

  return { captures, loading, markReviewed, refresh }
}
