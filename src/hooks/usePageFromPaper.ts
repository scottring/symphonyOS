import { useCallback, useRef, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { localYmd } from '@/lib/cadence/config'
import { planWindowDates, type PageAltitude } from '@/lib/planParse'
import { readSeasons } from '@/lib/cadence/seasons'
import { validatePageResult, type PageResult } from '@/lib/pageParse'
import type { FamilyMember } from '@/types/family'

export type PageParseStatus = 'idle' | 'parsing' | 'ready' | 'error'

/** Longest side of the uploaded JPEG — plenty for vision, kind to egress. */
const MAX_DIMENSION = 1600

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

async function toJpeg(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      0.8,
    )
  })
}

/**
 * Page-from-paper: upload the photographed (or scanned) page and ask the
 * `parse-page` edge function to read it into placeable items, prose notes,
 * and unclear lines. No rows are written here — the review sheet commits
 * only what the user confirms.
 *
 * Retry re-invokes the function with the already-uploaded image (no re-upload).
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
    if (fnErr) throw new Error(fnErr.message)
    if (data?.error) throw new Error(String(data.error))
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
      if (uploadErr) throw new Error(uploadErr.message)

      storagePathRef.current = storagePath
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

  return { status, result, error, parseFromBlob, retry, reset }
}
