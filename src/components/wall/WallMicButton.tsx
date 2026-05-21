import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { transcribeVoice, isOpenBrainConfigured } from '@/lib/openBrain'

// Floating mic button — captures voice → Whisper → family inbox task.
// Compact replacement for the old full-panel WallScratchpad on the wall.

type Phase = 'idle' | 'recording' | 'transcribing' | 'saving' | 'saved' | 'error'

const MAX_RECORDING_SECONDS = 60

export function WallMicButton() {
  const { user } = useAuth()
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [transcribed, setTranscribed] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isMediaRecorderSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  const isSupported = isMediaRecorderSupported && isOpenBrainConfigured

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
  }, [])

  const scheduleReset = useCallback((ms: number) => {
    if (resetRef.current) clearTimeout(resetRef.current)
    resetRef.current = setTimeout(() => {
      setPhase('idle')
      setErrorMsg(null)
      setTranscribed('')
      setSeconds(0)
    }, ms)
  }, [])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        try { mediaRecorderRef.current.stop() } catch { /* noop */ }
      }
      cleanup()
      if (resetRef.current) clearTimeout(resetRef.current)
    }
  }, [cleanup])

  const saveTask = useCallback(async (text: string) => {
    if (!user) return
    const trimmed = text.trim()
    if (!trimmed) {
      setErrorMsg('Nothing heard')
      setPhase('error')
      scheduleReset(2500)
      return
    }
    setTranscribed(trimmed)
    setPhase('saving')
    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: trimmed,
      context: 'family',
      scheduled_for: null,
      completed: false,
    })
    if (error) {
      console.error('[mic] save failed:', error)
      setErrorMsg('Save failed')
      setPhase('error')
      scheduleReset(2500)
    } else {
      setPhase('saved')
      scheduleReset(2200)
    }
  }, [user, scheduleReset])

  const startRecording = useCallback(async () => {
    if (resetRef.current) { clearTimeout(resetRef.current); resetRef.current = null }
    setErrorMsg(null)
    setTranscribed('')
    setSeconds(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        chunksRef.current = []
        cleanup()
        if (blob.size === 0) { setPhase('idle'); return }
        setPhase('transcribing')
        const result = await transcribeVoice(blob)
        if (!result.ok) {
          const msg = result.reason === 'timeout' ? 'Transcribe timed out'
            : result.reason === 'network' ? "Can't reach transcribe service"
            : result.reason === 'http' ? `Server error (${result.detail ?? 'unknown'})`
            : result.reason === 'empty' ? 'Nothing heard'
            : 'Transcribe unavailable'
          setErrorMsg(msg)
          setPhase('error')
          scheduleReset(3000)
          return
        }
        await saveTask(result.text)
      }
      mr.onerror = () => {
        setErrorMsg('Recording failed')
        setPhase('error')
        cleanup()
        scheduleReset(2500)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setPhase('recording')
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
      autoStopRef.current = setTimeout(() => {
        if (mr.state === 'recording') mr.stop()
      }, MAX_RECORDING_SECONDS * 1000)
    } catch (err) {
      cleanup()
      if (err instanceof DOMException && err.name === 'NotAllowedError') setErrorMsg('Mic blocked')
      else if (err instanceof DOMException && err.name === 'NotFoundError') setErrorMsg('No mic')
      else setErrorMsg('Mic unavailable')
      setPhase('error')
      scheduleReset(2500)
    }
  }, [cleanup, saveTask, scheduleReset])

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (mr?.state === 'recording') mr.stop()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
  }, [])

  const handleTap = useCallback(() => {
    if (!isSupported) return
    if (phase === 'idle' || phase === 'error') startRecording()
    else if (phase === 'recording') stopRecording()
  }, [isSupported, phase, startRecording, stopRecording])

  if (!isSupported) return null

  const isBusy = phase === 'transcribing' || phase === 'saving'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const timer = `${m}:${s.toString().padStart(2, '0')}`

  // Floating tooltip showing status above the button
  const tooltip =
    phase === 'recording' ? `Recording · ${timer} · tap to stop` :
    phase === 'transcribing' ? 'Transcribing…' :
    phase === 'saving' ? 'Saving…' :
    phase === 'saved' ? `Saved: "${transcribed.length > 50 ? transcribed.slice(0, 50) + '…' : transcribed}"` :
    phase === 'error' ? errorMsg :
    null

  return (
    <>
      {tooltip && (
        <div
          className={`
            fixed bottom-[6.5rem] right-6 z-40 px-4 py-2 rounded-xl
            backdrop-blur-md border text-[0.85rem] font-bold max-w-[380px] truncate
            ${phase === 'recording' ? 'bg-red-500/20 border-red-400/40 text-red-100'
              : phase === 'saved' ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100'
              : phase === 'error' ? 'bg-red-900/30 border-red-700/40 text-red-200'
              : 'bg-white/10 border-white/20 text-white/80'}
          `}
        >
          {tooltip}
        </div>
      )}
      <button
        type="button"
        onClick={handleTap}
        disabled={isBusy}
        aria-label="Voice capture"
        className={`
          fixed bottom-6 right-6 z-40
          w-[4.5rem] h-[4.5rem] rounded-full
          flex items-center justify-center text-[2rem]
          backdrop-blur-md border-2 transition-all select-none
          shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          ${phase === 'recording'
            ? 'bg-red-500/30 border-red-400/70 animate-pulse'
            : phase === 'saved'
              ? 'bg-emerald-500/25 border-emerald-400/60'
              : phase === 'error'
                ? 'bg-red-900/30 border-red-700/50'
                : 'bg-white/10 border-white/25 hover:bg-white/15 hover:border-white/40 active:scale-95'}
          ${isBusy ? 'cursor-wait' : 'cursor-pointer'}
        `}
        style={{ touchAction: 'manipulation' }}
      >
        {phase === 'recording' && '🔴'}
        {phase === 'transcribing' && '💭'}
        {phase === 'saving' && '💭'}
        {phase === 'saved' && '✅'}
        {phase === 'error' && '⚠️'}
        {phase === 'idle' && '🎙️'}
      </button>
    </>
  )
}
