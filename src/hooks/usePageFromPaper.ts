import { useCallback, useRef, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { localYmd } from '@/lib/cadence/config'
import { planWindowDates, type PageAltitude } from '@/lib/planParse'
import { readSeasons } from '@/lib/cadence/seasons'
import { validatePageResult, type PageResult } from '@/lib/pageParse'
import { SessionExpiredError } from '@/lib/authErrors'
import { toJpeg } from '@/lib/toJpeg'
import { codeFromBody, paperErrorMessage } from '@/lib/paperPlan/errors'
import type { FamilyMember } from '@/types/family'

/**
 * A non-2xx `parse-page` response, read once: `.context` is the raw
 * `Response`, whose body can only be read once and only asynchronously. A 401
 * (by status or by the body's own message) is a sign-out; anything else is
 * turned into a sentence a person can act on — never the parser's or the
 * transport's message ("Unexpected token 'I'…", 2026-09-23).
 */
async function readFunctionError(fnErr: { context?: { status?: number; json?: () => Promise<unknown> } }): Promise<Error> {
  let body: unknown = null
  try { body = await fnErr.context?.json?.() } catch { /* not JSON */ }
  const code = codeFromBody(body, fnErr.context?.status)
  return code === 'unauthorized' ? new SessionExpiredError() : new Error(paperErrorMessage(code))
}

export type PageParseStatus = 'idle' | 'parsing' | 'ready' | 'error'

const EMPTY: PageResult = {
  items: [],
  notes: [],
  unclear: [],
  windowDates: [],
  altitude: 'week',
  storagePath: null,
  pageTitle: null,
  titlePeriod: null,
}

/**
 * Page-from-paper: upload the photographed (or scanned) page and ask the
 * `parse-page` edge function to read it into placeable items, prose notes,
 * and unclear lines. No rows are written here — the review sheet commits
 * only what the user confirms.
 *
 * Retry re-invokes the function with the already-uploaded image (no re-upload).
 * `parseFromStoragePath` is the same read for a page that is already in the
 * bucket — the phone hand-off uploads it from the other device.
 */
export function usePageFromPaper(members: FamilyMember[]) {
  const [status, setStatus] = useState<PageParseStatus>('idle')
  const [result, setResult] = useState<PageResult>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const storagePathRef = useRef<string | null>(null)
  // Remembered for retry: the second call must read the page as the same
  // kind of page the user said it was.
  const altitudeRef = useRef<PageAltitude>('week')

  const invokeParse = useCallback(async (storagePath: string, altitude: PageAltitude) => {
    const today = new Date()
    // The season window runs to the end of the season the page is for, per
    // the household's boundaries (cached by useHouseholdSeasons).
    const dates = planWindowDates(today, altitude, readSeasons())
    const { data, error: fnErr } = await supabase.functions.invoke('parse-page', {
      body: {
        storagePath,
        altitude,
        // A year page has no dates; the function requires no window for it.
        placeStart: dates[0],
        placeEnd: dates[dates.length - 1],
        today: localYmd(today),
        // role_label rides along so the model knows a named child is the
        // subject of "dentist 10am", not the one who drives (parse-page prompt).
        members: members.map((m) => ({ id: m.id, name: m.name, role: m.role_label ?? null })),
      },
    })
    if (fnErr) throw await readFunctionError(fnErr as { context?: { status?: number; json?: () => Promise<unknown> } })
    if (data?.error) throw new Error(paperErrorMessage(codeFromBody(data)))
    // `dates` is only the fallback — the response echoes the window it actually
    // used, and that is what the review sheet must offer.
    setResult(validatePageResult(data, members.map((m) => ({ id: m.id, name: m.name, role: m.role_label ?? null })), dates, altitude))
    setStatus('ready')
  }, [members])

  const parseFromBlob = useCallback(async (blob: Blob, altitude: PageAltitude = 'week') => {
    altitudeRef.current = altitude
    setStatus('parsing')
    setError(null)
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not signed in')

      const ext = blob.type === 'application/pdf' ? 'pdf' : 'jpg'
      const storagePath = `${user.id}/page/${crypto.randomUUID()}.${ext}`
      const upload = blob.type === 'application/pdf' ? blob : await toJpeg(blob)
      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(storagePath, upload, { contentType: blob.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', upsert: true })
      if (uploadErr) throw new Error(paperErrorMessage('network'))

      storagePathRef.current = storagePath
      await invokeParse(storagePath, altitude)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [invokeParse])

  const parseFromStoragePath = useCallback(async (storagePath: string, altitude: PageAltitude = 'week') => {
    altitudeRef.current = altitude
    storagePathRef.current = storagePath
    setStatus('parsing')
    setError(null)
    try {
      await invokeParse(storagePath, altitude)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [invokeParse])

  const retry = useCallback(async () => {
    const storagePath = storagePathRef.current
    if (!storagePath) return
    setStatus('parsing')
    setError(null)
    try {
      await invokeParse(storagePath, altitudeRef.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [invokeParse])

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(EMPTY)
    setError(null)
    storagePathRef.current = null
    altitudeRef.current = 'week'
  }, [])

  return { status, result, error, parseFromBlob, parseFromStoragePath, retry, reset }
}
