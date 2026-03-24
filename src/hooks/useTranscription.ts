import { useState, useCallback, useRef, useEffect } from 'react'

export interface TranscriptEntry {
  text: string
  timestamp: Date
  isFinal: boolean
}

interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

export function useTranscription() {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const shouldRestartRef = useRef(false)

  const isSupported =
    typeof window !== 'undefined' &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition)

  const startTranscription = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser')
      return
    }

    setError(null)
    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) return

    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript.trim()

        if (result.isFinal) {
          setTranscript((prev) => [
            ...prev,
            { text, timestamp: new Date(), isFinal: true },
          ])
          setInterimText('')
        } else {
          interim = text
        }
      }

      if (interim) {
        setInterimText(interim)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are not real errors
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.error('[useTranscription] error:', event.error, event.message)
      setError(event.error)
    }

    recognition.onend = () => {
      // Auto-restart if we're still supposed to be transcribing
      // (Web Speech API stops after silence)
      if (shouldRestartRef.current) {
        try {
          recognition.start()
        } catch {
          // Already started or disposed
        }
      } else {
        setIsTranscribing(false)
      }
    }

    recognitionRef.current = recognition
    shouldRestartRef.current = true

    try {
      recognition.start()
      setIsTranscribing(true)
    } catch (err) {
      setError('Failed to start transcription')
      console.error('[useTranscription] start error:', err)
    }
  }, [isSupported])

  const stopTranscription = useCallback(() => {
    shouldRestartRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsTranscribing(false)
    setInterimText('')
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript([])
    setInterimText('')
  }, [])

  // Get full transcript as a string
  const getTranscriptText = useCallback(() => {
    return transcript.map((e) => e.text).join('\n')
  }, [transcript])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  return {
    isSupported,
    isTranscribing,
    transcript,
    interimText,
    error,
    startTranscription,
    stopTranscription,
    clearTranscript,
    getTranscriptText,
  }
}
