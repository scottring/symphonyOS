// src/hooks/useSchoolDigests.ts
//
// The household's kept school digests, newest first, one a day. The row
// policy decides who sees them (an adult who may review school mail, or the
// kitchen wall); this hook only reads.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { digestFromRow, onePerDay, type SchoolDigest, type SchoolDigestRow } from '@/lib/schoolDigest/schoolDigests'

/** Six weeks of school days. */
const KEEP = 45

/** How often to look for a new digest inside the arrival window. */
export const DIGEST_CHECK_MS = 10 * 60 * 1000

/** The digest goes out at 5pm local, and a failed send retries inside that
 *  hour; a re-run can land later in the evening. Outside [17:00, 22:00) there
 *  is nothing new to find, so the check stays off — the wall is always
 *  visible, and every poller on it counts against egress (lib/quietHours). */
export function inDigestWindow(date: Date = new Date()): boolean {
  const h = date.getHours()
  return h >= 17 && h < 22
}

export function useSchoolDigests() {
  const [digests, setDigests] = useState<SchoolDigest[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const newestIdRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('school_digests')
      .select('id, digest_date, date_label, sections, to_do_count, created_at')
      .order('created_at', { ascending: false })
      .limit(KEEP)
    if (error) {
      console.error('school digests did not load:', error.message)
      setFailed(true)
    } else {
      const rows = (data ?? []) as SchoolDigestRow[]
      newestIdRef.current = rows[0]?.id ?? null
      setFailed(false)
      setDigests(onePerDay(rows.map(digestFromRow)))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  // Today's arrives at 5pm, often while the page or the wall is already open.
  // A tab switched back to refetches here; the kitchen wall never leaves
  // view, so it relies on the check below.
  useRefreshOnVisible(() => { void refresh() })

  // In the arrival window, ask only for the newest row's id (a few bytes) and
  // reload the list when it changed, so the wall shows the 5pm digest without
  // a reload.
  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        if (typeof document !== 'undefined' && document.hidden) return
        if (!inDigestWindow()) return
        const { data, error } = await supabase
          .from('school_digests')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) return
        const newest = (data?.[0] as { id: string } | undefined)?.id ?? null
        if (newest && newest !== newestIdRef.current) void refresh()
      })()
    }, DIGEST_CHECK_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return { digests, loading, failed, refresh }
}
