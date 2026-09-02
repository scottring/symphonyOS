import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * The household's secret forwarding address and the last few emails that
 * landed on it. `ensure_inbound_token` mints the token on first read, so
 * opening Settings is what gives a founding household its address.
 *
 * Retrying a failed extraction needs CAPTURE_SHARED_SECRET, which the browser
 * must never hold — the `capture-retry` edge function holds it and checks the
 * caller shares the household before forwarding to `extract-email`.
 */

export const INBOUND_DOMAIN = 'symphony-os.com'

export interface SchoolMailCapture {
  id: string
  subject: string | null
  sourceLabel: string | null
  status: string
  error: string | null
  createdAt: string
}

/** Supabase errors are plain objects, not Errors — read either shape. */
function messageOf(err: unknown): string | null {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return null
}

interface CaptureRow {
  id: string
  subject: string | null
  source_label: string | null
  status: string
  error: string | null
  created_at: string
}

export function useSchoolMail() {
  const [address, setAddress] = useState<string | null>(null)
  const [recent, setRecent] = useState<SchoolMailCapture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: householdId, error: householdError } = await supabase.rpc('get_user_household_id')
      if (householdError) throw householdError
      if (!householdId) {
        setAddress(null)
        setRecent([])
        return
      }

      const { data: token, error: tokenError } = await supabase.rpc('ensure_inbound_token', {
        p_household: householdId,
      })
      if (tokenError) throw tokenError
      setAddress(token ? `${token}@${INBOUND_DOMAIN}` : null)

      const { data, error: capturesError } = await supabase
        .from('captures')
        .select('id, subject, source_label, status, error, created_at')
        .eq('kind', 'email')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (capturesError) throw capturesError

      setRecent(((data ?? []) as CaptureRow[]).map((row) => ({
        id: row.id,
        subject: row.subject,
        sourceLabel: row.source_label,
        status: row.status,
        error: row.error,
        createdAt: row.created_at,
      })))
      setError(null)
    } catch (err) {
      console.error('Error loading school mail:', err)
      setError(messageOf(err) ?? 'Could not load school mail')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const retry = useCallback(async (captureId: string) => {
    setError(null)
    try {
      const { error: invokeError } = await supabase.functions.invoke('capture-retry', {
        body: { capture_id: captureId },
      })
      if (invokeError) throw invokeError
    } catch (err) {
      console.error('Error retrying capture:', err)
      setError(messageOf(err) ?? 'Retry failed')
      return
    }
    await load()
  }, [load])

  return { address, loading, error, recent, retry, refresh: load }
}
