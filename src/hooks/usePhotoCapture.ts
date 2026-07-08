import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { TaskContext } from '@/types/task'

export type PhotoCaptureStatus = 'idle' | 'working' | 'started' | 'error'

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

  const captureFromFile = useCallback(async (file: File, context?: TaskContext | null): Promise<boolean> => {
    setStatus('working')
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
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
        title: 'Analyzing photo…',
        bucket: 'inbox',
        context: context ?? null,
        capture_meta: { status: 'pending', storage_path: storagePath },
      })
      if (insertErr) throw new Error(insertErr.message)

      // Fire-and-forget: the function updates the task server-side and realtime
      // brings it back. Await so a hard failure can surface, but the UI treats
      // 'started' as done.
      const { error: fnErr } = await supabase.functions.invoke('analyze-capture', {
        body: {
          taskId,
          storagePath,
          fileName: file.name || 'capture.jpg',
          fileType: 'image/jpeg',
          fileSize: jpeg.size,
        },
      })
      if (fnErr) console.error('analyze-capture invoke failed (task stays pending):', fnErr)

      setStatus('started')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
      return false
    }
  }, [])

  const reset = useCallback(() => { setStatus('idle'); setError(null) }, [])

  return { status, error, captureFromFile, reset }
}
