import { useCallback, useRef, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { localYmd } from '@/lib/cadence/config'
import { planWindowDates, validatePlanItems, type PlanItem } from '@/lib/planParse'
import type { FamilyMember } from '@/types/family'

export type PlanParseStatus = 'idle' | 'parsing' | 'ready' | 'error'

/** Longest side of the uploaded JPEG — plenty for vision, kind to egress. */
const MAX_DIMENSION = 1600

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
 * Plan-from-paper: upload the photographed plan page and ask the `parse-plan`
 * edge function to read it into placeable items. No task rows are written here
 * — the review sheet commits only what the user confirms.
 *
 * Retry re-invokes the function with the already-uploaded image (no re-upload).
 */
export function usePlanFromPaper(members: FamilyMember[]) {
  const [status, setStatus] = useState<PlanParseStatus>('idle')
  const [items, setItems] = useState<PlanItem[]>([])
  const [error, setError] = useState<string | null>(null)
  // The window shown to the model — the review sheet must offer the SAME dates.
  const [windowDates, setWindowDates] = useState<string[]>([])
  const storagePathRef = useRef<string | null>(null)

  const invokeParse = useCallback(async (storagePath: string) => {
    const dates = planWindowDates(new Date())
    setWindowDates(dates)
    const { data, error: fnErr } = await supabase.functions.invoke('parse-plan', {
      body: {
        storagePath,
        placeStart: dates[0],
        placeEnd: dates[dates.length - 1],
        today: localYmd(new Date()),
        members: members.map((m) => ({ id: m.id, name: m.name })),
      },
    })
    if (fnErr) throw new Error(fnErr.message)
    if (data?.error) throw new Error(String(data.error))
    setItems(validatePlanItems(data, dates, new Set(members.map((m) => m.id))))
    setStatus('ready')
  }, [members])

  const parseFromBlob = useCallback(async (blob: Blob) => {
    setStatus('parsing')
    setError(null)
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not signed in')

      const storagePath = `${user.id}/plan/${crypto.randomUUID()}.jpg`
      const jpeg = await toJpeg(blob)
      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(storagePath, jpeg, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw new Error(uploadErr.message)

      storagePathRef.current = storagePath
      await invokeParse(storagePath)
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
      await invokeParse(storagePath)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [invokeParse])

  const reset = useCallback(() => {
    setStatus('idle')
    setItems([])
    setError(null)
    setWindowDates([])
    storagePathRef.current = null
  }, [])

  return { status, items, error, windowDates, parseFromBlob, retry, reset }
}
