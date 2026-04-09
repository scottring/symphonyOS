import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTranscription } from '@/hooks/useTranscription'
import { supabase } from '@/lib/supabase'

// ============================================================================
// WallScratchpad — voice-first family inbox capture
// Tap the mic to dictate; what you say becomes a family inbox task.
// ============================================================================

interface RecentCapture {
  id: string
  title: string
  created_at: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const RECENT_POLL_INTERVAL_MS = 3 * 60 * 1000

export function WallScratchpad() {
  const { user } = useAuth()
  const {
    isSupported,
    isTranscribing,
    transcript,
    interimText,
    error,
    startTranscription,
    stopTranscription,
    clearTranscript,
  } = useTranscription()

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [recentCaptures, setRecentCaptures] = useState<RecentCapture[]>([])

  // Mirror the latest transcript text in a ref so the save handler can read
  // it after async delays without stale closures.
  const transcriptTextRef = useRef('')
  useEffect(() => {
    transcriptTextRef.current = transcript.map(t => t.text).join(' ')
  }, [transcript])

  // Fetch today's family inbox tasks (the recent dictations)
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

  const handleMicTap = useCallback(async () => {
    if (!user || !isSupported) return
    if (saveState === 'saving') return

    if (isTranscribing) {
      // Stop and save whatever was captured
      stopTranscription()
      // Let the final onresult callbacks land before reading the transcript
      await new Promise(resolve => setTimeout(resolve, 300))
      const text = transcriptTextRef.current.trim()
      clearTranscript()
      transcriptTextRef.current = ''

      if (!text) return

      setSaveState('saving')
      const { error: insertError } = await supabase.from('tasks').insert({
        user_id: user.id,
        title: text,
        context: 'family',
        scheduled_for: null,
        completed: false,
      })

      if (insertError) {
        console.error('[scratchpad] save failed:', insertError)
        setSaveState('error')
        setTimeout(() => setSaveState('idle'), 3000)
      } else {
        setSaveState('saved')
        await fetchRecent()
        setTimeout(() => setSaveState('idle'), 2000)
      }
    } else {
      // Start a new recording
      clearTranscript()
      transcriptTextRef.current = ''
      setSaveState('idle')
      startTranscription()
    }
  }, [
    user,
    isSupported,
    isTranscribing,
    saveState,
    startTranscription,
    stopTranscription,
    clearTranscript,
    fetchRecent,
  ])

  // ═══ Render: unsupported browser ═══
  if (!isSupported) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="text-[4rem] mb-4 opacity-50">🎙️</div>
        <div className="font-display text-white/70 text-[1.3rem] mb-1">Voice capture unavailable</div>
        <div className="text-[0.8rem] text-white/30 font-bold uppercase tracking-wider">
          This browser doesn't support speech recognition
        </div>
      </div>
    )
  }

  const finalText = transcript.map(t => t.text).join(' ')
  const hasText = Boolean(finalText || interimText)
  const errorLabel =
    error === 'not-allowed' || error === 'service-not-allowed'
      ? 'Microphone blocked'
      : error === 'audio-capture'
        ? 'No microphone found'
        : error

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4 flex-shrink-0">
        <h2 className="font-display text-white text-[1.6rem] tracking-tight leading-none">
          Brain Dump
        </h2>
        <span className="text-white/30 text-[0.65rem] font-black uppercase tracking-widest">
          {isTranscribing ? 'Listening…' : 'Tap to speak'}
        </span>
      </div>

      {/* Big mic zone — flex-1 fills available space */}
      <button
        type="button"
        onClick={handleMicTap}
        className={`
          flex-1 min-h-0 flex flex-col items-center justify-center gap-5
          rounded-2xl border-2 transition-all select-none
          ${isTranscribing
            ? 'bg-red-500/15 border-red-400/60 shadow-[0_0_60px_rgba(248,113,113,0.15)]'
            : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.99]'}
        `}
        style={{ touchAction: 'manipulation' }}
      >
        <div
          className={`
            text-[5.5rem] leading-none transition-transform
            ${isTranscribing ? 'animate-pulse' : ''}
          `}
        >
          {isTranscribing ? '🔴' : '🎙️'}
        </div>

        {hasText ? (
          <div
            className="text-white font-medium text-[1.35rem] text-center px-10 leading-snug max-h-[8rem] overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {finalText}
            {interimText && (
              <span className="text-white/40">{finalText ? ' ' : ''}{interimText}</span>
            )}
          </div>
        ) : (
          <div className="text-white/40 font-black text-[0.9rem] uppercase tracking-[0.2em]">
            {isTranscribing ? 'Speak freely' : 'Drop a thought'}
          </div>
        )}

        {errorLabel && !isTranscribing && (
          <div className="mt-2 px-4 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25">
            <span className="text-red-300/80 text-[0.7rem] font-black uppercase tracking-widest">
              {errorLabel}
            </span>
          </div>
        )}
      </button>

      {/* Save status */}
      {saveState !== 'idle' && (
        <div
          className={`
            mt-3 py-2.5 px-4 rounded-xl text-center text-[0.8rem] font-black uppercase tracking-widest flex-shrink-0
            ${saveState === 'saving' ? 'bg-white/5 text-white/50' : ''}
            ${saveState === 'saved' ? 'bg-emerald-500/20 text-emerald-300' : ''}
            ${saveState === 'error' ? 'bg-red-500/20 text-red-300' : ''}
          `}
        >
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && '✓ Added to family inbox'}
          {saveState === 'error' && 'Save failed — try again'}
        </div>
      )}

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
