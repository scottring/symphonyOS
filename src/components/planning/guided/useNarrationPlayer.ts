// src/components/planning/guided/useNarrationPlayer.ts
//
// Plays the current step's narration clip. Mute is persisted per horizon;
// the daily session flips to muted-by-default after its first completion
// (localStorage 'guided.daily.completed'). Missing audio degrades silently —
// the narration text is always on screen.
import { useEffect, useRef, useState, useCallback } from 'react'

function defaultMuted(horizon: string): boolean {
  const stored = localStorage.getItem(`guided.muted.${horizon}`)
  if (stored !== null) return stored === '1'
  return horizon === 'daily' && localStorage.getItem('guided.daily.completed') === '1'
}

export function useNarrationPlayer(horizon: string, clipUrl: string | null) {
  const [muted, setMuted] = useState(() => defaultMuted(horizon))
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggleMuted = useCallback(() => {
    const next = !muted
    localStorage.setItem(`guided.muted.${horizon}`, next ? '1' : '0')
    if (next && audioRef.current) { audioRef.current.pause() }
    setMuted(next)
  }, [horizon, muted])

  useEffect(() => {
    if (muted || !clipUrl) return
    const audio = new Audio(clipUrl)
    audioRef.current = audio
    audio.play().catch((err) => console.warn('[narration] playback failed:', err))
    return () => { audio.pause(); audioRef.current = null }
  }, [clipUrl, muted])

  return { muted, toggleMuted }
}
