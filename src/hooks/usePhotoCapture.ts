import { useCallback, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import type { TaskContext } from '@/types/task'
import { scopeForDomain } from '@/lib/scope'

export type PhotoCaptureStatus = 'idle' | 'working' | 'started' | 'error'
/** What the picture is, so the Inbox placeholder names it truthfully. */
export type CaptureKind = 'photo' | 'screenshot' | 'image'

/** A scheduled thing read off the picture (analyze-capture's captureEvents). */
export interface CaptureEvent {
  title: string
  /** UTC instant, or YYYY-MM-DD for an all-day event. */
  start: string
  end: string | null
  allDay: boolean
  location: string | null
  who: string[]
  details: string | null
}

export interface PhotoCaptureResult {
  /** The Inbox row the picture became. */
  taskId: string
  storagePath: string
  events: CaptureEvent[]
  links: { url: string; title?: string }[]
}

const PLACEHOLDER_TITLE: Record<CaptureKind, string> = {
  photo: 'Analyzing photo…',
  screenshot: 'Reading screenshot…',
  image: 'Reading image…',
}

/** Longest side of the uploaded JPEG — plenty for vision, kind to egress. */
const MAX_DIMENSION = 1600

async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      0.8,
    )
  })
}

/**
 * Photo-first capture, web edition (twin of the iOS flow): upload the image to
 * the `attachments` bucket, create an "Analyzing photo…" inbox task, and fire
 * the `analyze-capture` edge function. Claude vision writes the enriched title
 * + store-ready note and a suggested destination; the realtime tasks
 * subscription pops the finished item into the inbox.
 *
 * On macOS, the file picker's "Import from iPhone or iPad → Take Photo" makes
 * the iPhone a camera for the desktop app (Continuity Camera); on mobile web
 * the same input offers the camera directly.
 */
export function usePhotoCapture() {
  const [status, setStatus] = useState<PhotoCaptureStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const captureFromFile = useCallback(async (file: File, context?: TaskContext | null, kind: CaptureKind = 'photo'): Promise<PhotoCaptureResult | null> => {
    setStatus('working')
    setError(null)
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not signed in')

      const taskId = crypto.randomUUID()
      const storagePath = `${user.id}/capture/${taskId}.jpg`
      const jpeg = await toJpeg(file)

      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(storagePath, jpeg, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw new Error(uploadErr.message)

      const { error: insertErr } = await supabase.from('tasks').insert({
        id: taskId,
        user_id: user.id,
        title: PLACEHOLDER_TITLE[kind],
        bucket: 'inbox',
        context: context ?? null,
        // Same rule as addTask: a family photo-capture has to be readable by
        // the household, not just its owner. Found by the scope tripwire once
        // it stopped cutting payloads at the first nested brace. The capture is
        // unassigned, so the domain alone decides.
        scope: scopeForDomain(context ?? null, [], null),
        capture_meta: { status: 'pending', storage_path: storagePath },
      })
      if (insertErr) throw new Error(insertErr.message)

      // The function updates the task server-side and realtime brings it back.
      // A refusal (no AI allowance, unreadable image) is said here, in the box,
      // rather than left as a placeholder that looks like it is still working.
      const { data, error: fnErr } = await supabase.functions.invoke('analyze-capture', {
        body: {
          taskId,
          storagePath,
          fileName: file.name || 'capture.jpg',
          fileType: 'image/jpeg',
          fileSize: jpeg.size,
          // So "call after 5 PM the night before" lands at 5 PM here.
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      if (fnErr) {
        const detail = await (fnErr as { context?: Response }).context?.json?.().catch(() => null) as { error?: string } | null
        throw new Error(detail?.error ?? fnErr.message)
      }

      setStatus('started')
      const reply = (data ?? {}) as { events?: CaptureEvent[]; links?: PhotoCaptureResult['links'] }
      return {
        taskId,
        storagePath,
        events: Array.isArray(reply.events) ? reply.events : [],
        links: Array.isArray(reply.links) ? reply.links.filter((l) => typeof l?.url === 'string') : [],
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
      return null
    }
  }, [])

  const reset = useCallback(() => { setStatus('idle'); setError(null) }, [])

  return { status, error, captureFromFile, reset }
}
