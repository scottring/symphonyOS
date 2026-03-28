import { useState, useCallback, useRef } from 'react'
import { transcribeVoice } from '@/lib/openBrain'

export function useVoiceInput() {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })

      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setRecording(true)
    } catch {
      setError('Microphone access denied')
    }
  }, [])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const mediaRecorder = mediaRecorderRef.current
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return null

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        setRecording(false)
        setTranscribing(true)

        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach((t) => t.stop())

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []

        try {
          const text = await transcribeVoice(blob)
          setTranscribing(false)
          if (text) {
            resolve(text)
          } else {
            setError('Transcription failed. Is Open Brain online?')
            resolve(null)
          }
        } catch {
          setTranscribing(false)
          setError('Transcription failed')
          resolve(null)
        }
      }

      mediaRecorder.stop()
    })
  }, [])

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stream.getTracks().forEach((t) => t.stop())
      mediaRecorder.stop()
    }
    setRecording(false)
    chunksRef.current = []
  }, [])

  return {
    recording,
    transcribing,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}
