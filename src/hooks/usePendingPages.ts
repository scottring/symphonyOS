// src/hooks/usePendingPages.ts
//
// Pages the Dropbox poller has read but Scott has not reviewed. A page is
// staged, never committed — the poller runs while he is elsewhere, so the
// review is the only place a page becomes tasks and notes.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { validatePageResult, type PageResult, type PlanMember } from '@/lib/pageParse'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { showToast } from '@/hooks/useToast'

export const SUPERNOTE_SOURCE_KEY = 'supernote:export'

export interface PendingPage {
  captureId: string
  label: string
  createdAt: Date
  result: PageResult
}

interface CaptureRow {
  id: string
  source_label: string | null
  raw_text: string | null
  created_at: string
}

export function usePendingPages(members: PlanMember[]) {
  const [pages, setPages] = useState<PendingPage[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('captures')
      .select('id, source_label, raw_text, created_at')
      .eq('kind', 'image')
      .eq('source_key', SUPERNOTE_SOURCE_KEY)
      .eq('status', 'extracted')
      .order('created_at', { ascending: true })

    const rows = (data ?? []) as CaptureRow[]
    setPages(
      rows.flatMap((row) => {
        if (!row.raw_text) return []
        try {
          // The window comes from the stored result — a page parsed last night
          // must be reviewed against the dates the model was shown, not today's.
          const result = validatePageResult(JSON.parse(row.raw_text), members, [])
          return [{
            captureId: row.id,
            label: row.source_label ?? 'Page',
            createdAt: new Date(row.created_at),
            result,
          }]
        } catch {
          return []
        }
      }),
    )
    setLoading(false)
  }, [members])

  useEffect(() => { void refresh() }, [refresh])

  // The poller runs every 15 minutes, so a page can arrive while the Inbox is
  // already open. Same house pattern as Today's calendar events: pick the new
  // rows up when the tab comes back, not on a timer.
  useRefreshOnVisible(() => { void refresh() })

  /**
   * Delete the staged capture row. Returns whether it actually went.
   *
   * The optimistic-only version was dangerous: a rejected DELETE (the RLS
   * policy, an expired JWT) left the row alive in the DB while the UI called
   * it done, so the next Inbox mount re-surfaced the page and re-reviewing it
   * wrote a DUPLICATE set of tasks and notes. On failure the row stays put and
   * the user is told.
   */
  const dismiss = useCallback(async (captureId: string): Promise<boolean> => {
    const { error } = await supabase.from('captures').delete().eq('id', captureId)
    if (error) {
      showToast('Could not clear that page — it is still in your inbox', 'error', 5000)
      return false
    }
    setPages((prev) => prev.filter((p) => p.captureId !== captureId))
    return true
  }, [])

  return { pages, loading, dismiss, refresh }
}
