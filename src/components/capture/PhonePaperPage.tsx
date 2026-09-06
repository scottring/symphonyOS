import { useCallback, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, Check, Loader2, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toJpeg } from '@/lib/toJpeg'
import { handoffStoragePath } from '@/lib/paperHandoff'

type Status = 'idle' | 'uploading' | 'sent' | 'error'

/**
 * The phone half of "Use your phone": opened from the desktop's QR code, it
 * takes one photo with the phone's own camera and uploads it where the
 * desktop is already listening. Mounted inside AuthGate, so the upload runs
 * as the signed-in user — the same account as the desktop.
 */
export function PhonePaperPage({ user }: { user: { id: string } }) {
  const { id = '' } = useParams<{ id: string }>()
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(async (file: File | undefined) => {
    if (!file || !id) return
    setStatus('uploading')
    setError(null)
    try {
      const jpeg = await toJpeg(file)
      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(handoffStoragePath(user.id, id), jpeg, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw new Error(uploadErr.message)
      setStatus('sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [id, user.id])

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-6 text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Take a photo of the page"
        onChange={(e) => { void send(e.target.files?.[0]); e.target.value = '' }}
      />
      {status === 'sent' ? (
        <div className="space-y-3 max-w-xs">
          <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 grid place-items-center mx-auto">
            <Check className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-display text-neutral-900">Sent to your desktop</h1>
          <p className="text-[15px] text-neutral-600">Symphony is reading the page there. You can close this.</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm text-neutral-500 hover:text-neutral-800 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" /> Retake
          </button>
        </div>
      ) : (
        <div className="space-y-4 max-w-xs">
          <h1 className="text-2xl font-display text-neutral-900">Snap your page</h1>
          <p className="text-[15px] text-neutral-600">
            Lay the page flat, fill the frame, and take one photo. It goes straight to your desktop.
          </p>
          {status === 'error' && (
            <p className="text-sm text-red-700 break-words" role="alert">{error}</p>
          )}
          <button
            type="button"
            disabled={status === 'uploading'}
            onClick={() => inputRef.current?.click()}
            className="btn-primary w-full px-5 py-4 rounded-2xl text-[17px] inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {status === 'uploading'
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending…</>
              : <><Camera className="w-5 h-5" /> Take photo</>}
          </button>
        </div>
      )}
    </div>
  )
}
