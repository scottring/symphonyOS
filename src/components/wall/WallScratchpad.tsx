import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { transcribeVoice, isOpenBrainConfigured } from '@/lib/openBrain'

// ============================================================================
// WallScratchpad — voice-first family inbox capture
//
// Uses MediaRecorder (universal browser support, including Pi Chromium) to
// capture audio, then ships it to Open Brain's Groq Whisper endpoint for
// transcription. The result is saved as a family inbox task.
//
// Web Speech API is intentionally NOT used: Raspberry Pi Chromium doesn't
// ship with the Google speech backend that webkitSpeechRecognition requires.
// ============================================================================

interface RecentCapture {
  id: string
  title: string
  created_at: string
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'saving' | 'saved' | 'error'

const RECENT_POLL_INTERVAL_MS = 3 * 60 * 1000
const MAX_RECORDING_SECONDS = 60

export function WallScratchpad() {
  const { user } = useAuth()

  const [phase, setPhase] = useState<Phase>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [transcribedText, setTranscribedText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [recentCaptures, setRecentCaptures] = useState<RecentCapture[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isMediaRecorderSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'

  const isSupported = isMediaRecorderSupported && isOpenBrainConfigured

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
  }, [])

  const scheduleReset = useCallback((ms: number) => {
    if (phaseResetRef.current) clearTimeout(phaseResetRef.current)
    phaseResetRef.current = setTimeout(() => {
      setPhase('idle')
      setErrorMessage(null)
      setTranscribedText('')
      setRecordingSeconds(0)
    }, ms)
  }, [])

  // Fetch today's family inbox tasks for the "Today" list
  const fetchRecent = useCallback(async () => {
    if (!user) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('tasks')
      .select('id, title, created_at')
      .eq('user_id', user.id)
      .eq('context', 'family')
      .eq('completed', false)
      .is('scheduled_for', null)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
    setRecentCaptures((data as RecentCapture[]) || [])
  }, [user])

  useEffect(() => {
    fetchRecent()
    const interval = setInterval(fetchRecent, RECENT_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchRecent])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop() } catch { /* noop */ }
      }
      cleanupStream()
      if (phaseResetRef.current) clearTimeout(phaseResetRef.current)
    }
  }, [cleanupStream])

  const handleTranscribedText = useCallback(
    async (text: string) => {
      if (!user) return
      const trimmed = text.trim()
      if (!trimmed) {
        setErrorMessage('Nothing heard — try again')
        setPhase('error')
        scheduleReset(3000)
        return
      }

      setTranscribedText(trimmed)
      setPhase('saving')

      const { error } = await supabase.from('tasks').insert({
        user_id: user.id,
        title: trimmed,
        context: 'family',
        scheduled_for: null,
        completed: false,
      })

      if (error) {
        console.error('[scratchpad] save failed:', error)
        setErrorMessage('Save failed')
        setPhase('error')
        scheduleReset(3000)
      } else {
        setPhase('saved')
        await fetchRecent()
        scheduleReset(2500)
      }
    },
    [user, fetchRecent, scheduleReset],
  )

  const startRecording = useCallback(async () => {
    if (phaseResetRef.current) {
      clearTimeout(phaseResetRef.current)
      phaseResetRef.current = null
    }
    setErrorMessage(null)
    setTranscribedText('')
    setRecordingSeconds(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mr = new MediaRecorder(stream)

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || 'audio/webm',
        })
        chunksRef.current = []
        cleanupStream()

        if (blob.size === 0) {
          setPhase('idle')
          return
        }

        setPhase('transcribing')
        const text = await transcribeVoice(blob)

        if (!text) {
          setErrorMessage('Transcription failed')
          setPhase('error')
          scheduleReset(3000)
          return
        }

        await handleTranscribedText(text)
      }

      mr.onerror = (e) => {
        console.error('[scratchpad] MediaRecorder error:', e)
        setErrorMessage('Recording failed')
        setPhase('error')
        cleanupStream()
        scheduleReset(3000)
      }

      mediaRecorderRef.current = mr
      mr.start()
      setPhase('recording')

      // Live timer
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1)
      }, 1000)

      // Hard safety cap
      autoStopRef.current = setTimeout(() => {
        if (mr.state === 'recording') mr.stop()
      }, MAX_RECORDING_SECONDS * 1000)
    } catch (err) {
      console.error('[scratchpad] getUserMedia failed:', err)
      cleanupStream()
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Microphone blocked')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setErrorMessage('No microphone found')
      } else {
        setErrorMessage('Microphone unavailable')
      }
      setPhase('error')
      scheduleReset(3000)
    }
  }, [cleanupStream, handleTranscribedText, scheduleReset])

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'recording') {
      mr.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
  }, [])

  const handleMicTap = useCallback(() => {
    if (!isSupported) return
    if (phase === 'idle' || phase === 'error') {
      startRecording()
    } else if (phase === 'recording') {
      stopRecording()
    }
    // Ignore taps during transcribing/saving/saved
  }, [isSupported, phase, startRecording, stopRecording])

  // ═══ Render: unsupported ═══
  if (!isSupported) {
    const reason = !isMediaRecorderSupported
      ? "This browser doesn't support audio recording"
      : 'Open Brain not configured — transcription unavailable'
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="text-[4rem] mb-4 opacity-50">🎙️</div>
        <div className="font-display text-white/70 text-[1.3rem] mb-1">Voice capture unavailable</div>
        <div className="text-[0.8rem] text-white/30 font-bold uppercase tracking-wider">
          {reason}
        </div>
      </div>
    )
  }

  const isBusy = phase === 'transcribing' || phase === 'saving'
  const minutes = Math.floor(recordingSeconds / 60)
  const seconds = recordingSeconds % 60
  const timerLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`

  const statusLabel: Record<Phase, string> = {
    idle: 'Tap to speak',
    recording: 'Listening…',
    transcribing: 'Transcribing…',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Error',
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4 flex-shrink-0">
        <h2 className="font-display text-white text-[1.6rem] tracking-tight leading-none">
          Brain Dump
        </h2>
        <span className="text-white/30 text-[0.65rem] font-black uppercase tracking-widest">
          {statusLabel[phase]}
        </span>
      </div>

      {/* Big mic zone */}
      <button
        type="button"
        onClick={handleMicTap}
        disabled={isBusy}
        className={`
          flex-1 min-h-0 flex flex-col items-center justify-center gap-5
          rounded-2xl border-2 transition-all select-none
          ${phase === 'recording'
            ? 'bg-red-500/15 border-red-400/60 shadow-[0_0_60px_rgba(248,113,113,0.15)]'
            : phase === 'saved'
              ? 'bg-emerald-500/15 border-emerald-400/50'
              : phase === 'error'
                ? 'bg-red-900/20 border-red-700/40'
                : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.99]'}
          ${isBusy ? 'cursor-wait' : 'cursor-pointer'}
        `}
        style={{ touchAction: 'manipulation' }}
      >
        <div
          className={`
            text-[5.5rem] leading-none transition-transform
            ${phase === 'recording' ? 'animate-pulse' : ''}
          `}
        >
          {phase === 'recording' && '🔴'}
          {phase === 'transcribing' && '💭'}
          {phase === 'saving' && '💭'}
          {phase === 'saved' && '✅'}
          {phase === 'error' && '⚠️'}
          {phase === 'idle' && '🎙️'}
        </div>

        {phase === 'recording' && (
          <>
            <div className="text-red-300 font-black text-[2rem] tabular-nums tracking-wide">
              {timerLabel}
            </div>
            <div className="text-white/40 font-black text-[0.75rem] uppercase tracking-[0.2em]">
              Tap to stop
            </div>
          </>
        )}

        {(phase === 'transcribing' || phase === 'saving') && (
          <div className="text-white/60 font-black text-[0.9rem] uppercase tracking-[0.2em]">
            {phase === 'transcribing' ? 'Hearing you out…' : 'Saving…'}
          </div>
        )}

        {phase === 'saved' && transcribedText && (
          <>
            <div className="text-white font-medium text-[1.2rem] text-center px-10 leading-snug max-h-[6rem] overflow-hidden">
              "{transcribedText}"
            </div>
            <div className="text-emerald-300/80 font-black text-[0.75rem] uppercase tracking-[0.2em]">
              Added to family inbox
            </div>
          </>
        )}

        {phase === 'error' && errorMessage && (
          <div className="text-red-300/80 font-black text-[0.8rem] uppercase tracking-widest px-6 text-center">
            {errorMessage}
          </div>
        )}

        {phase === 'idle' && (
          <div className="text-white/40 font-black text-[0.9rem] uppercase tracking-[0.2em]">
            Drop a thought
          </div>
        )}
      </button>

      {/* Recent captures from today */}
      {recentCaptures.length > 0 && (
        <div className="mt-4 flex-shrink-0">
          <div className="text-white/30 font-black uppercase tracking-[0.2em] text-[0.6rem] mb-2">
            Today
          </div>
          <div
            className="space-y-1.5 max-h-[8rem] overflow-y-auto pr-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {recentCaptures.map(c => (
              <div
                key={c.id}
                className="bg-white/[0.05] rounded-lg px-3 py-2 text-white/75 text-[0.85rem] leading-snug truncate"
              >
                {c.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
