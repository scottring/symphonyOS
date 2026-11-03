// src/hooks/useSchoolDigests.ts
//
// The household's kept school digests, newest first, one a day. The row
// policy decides who sees them (an adult who may review school mail, or the
// kitchen wall); this hook only reads.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { digestFromRow, onePerDay, type SchoolDigest, type SchoolDigestRow } from '@/lib/schoolDigest/schoolDigests'

/** Six weeks of school days. */
const KEEP = 45

export function useSchoolDigests() {
  const [digests, setDigests] = useState<SchoolDigest[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

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
      setFailed(false)
      setDigests(onePerDay(((data ?? []) as SchoolDigestRow[]).map(digestFromRow)))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  // Today's arrives at 5pm, often while the page or the wall is already open.
  useRefreshOnVisible(() => { void refresh() })

  return { digests, loading, failed, refresh }
}
