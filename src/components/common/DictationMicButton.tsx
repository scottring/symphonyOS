import { useEffect, useRef } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useTranscription } from '@/hooks/useTranscription'

interface Props {
  /** Called with each newly finalized phrase, ready to append to a field. */
  onTranscript: (text: string) => void
  className?: string
  title?: string
}

/**
 * A small mic button that dictates speech into a text field. Distinct from the
 * AI capture mic — this just transcribes speech and hands each final phrase to
 * `onTranscript` (the field appends it). Renders nothing where the Web Speech
 * API is unavailable. Reusable next to any input.
 */
export function DictationMicButton({ onTranscript, className = '', title = 'Dictate' }: Props) {
  const { isSupported, isTranscribing, transcript, startTranscription, stopTranscription } =
    useTranscription()

  // Emit only newly-added final entries (useTranscription accumulates them).
  const emittedRef = useRef(0)
  useEffect(() => {
    if (transcript.length > emittedRef.current) {
      for (let i = emittedRef.current; i < transcript.length; i++) {
        const text = transcript[i].text.trim()
        if (text) onTranscript(text)
      }
      emittedRef.current = transcript.length
    }
  }, [transcript, onTranscript])

  if (!isSupported) return null

  return (
    <button
      type="button"
      onClick={() => (isTranscribing ? stopTranscription() : startTranscription())}
      aria-label={isTranscribing ? 'Stop dictation' : 'Dictate'}
      aria-pressed={isTranscribing}
      title={title}
      className={`shrink-0 grid place-items-center rounded-full transition-colors ${
        isTranscribing
          ? 'text-red-600 bg-red-50 animate-pulse'
          : 'text-neutral-400 hover:text-primary-600 hover:bg-neutral-100'
      } ${className}`}
    >
      {isTranscribing ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  )
}
