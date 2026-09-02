// src/hooks/useCapture.ts
//
// The one capture a task came out of. A task extracted from a forwarded school
// email carries `capture_id`; this reads that row so the panel can show what
// was actually said — including for the partner who didn't forward it, which
// the household read policy on `captures` allows.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface Capture {
  id: string
  subject: string | null
  sender: string | null
  sourceLabel: string | null
  rawText: string | null
  createdAt: string
}

interface CaptureRow {
  id: string
  subject: string | null
  sender: string | null
  source_label: string | null
  raw_text: string | null
  created_at: string
}

/** Named columns only — `captures.raw_text` is the whole email, never SELECT *. */
const CAPTURE_COLUMNS = 'id, subject, sender, source_label, raw_text, created_at'

export function useCapture(id: string | undefined): { capture: Capture | null; loading: boolean } {
  const [capture, setCapture] = useState<Capture | null>(null)
  const [loading, setLoading] = useState(Boolean(id))

  useEffect(() => {
    if (!id) {
      setCapture(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void (async () => {
      const { data } = await supabase
        .from('captures')
        .select(CAPTURE_COLUMNS)
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      const row = data as CaptureRow | null
      setCapture(
        row
          ? {
              id: row.id,
              subject: row.subject,
              sender: row.sender,
              sourceLabel: row.source_label,
              rawText: row.raw_text,
              createdAt: row.created_at,
            }
          : null,
      )
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [id])

  return { capture, loading }
}
