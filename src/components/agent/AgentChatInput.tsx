import { useState, useCallback, useRef } from 'react'
import { useVoiceInput } from '@/hooks/useVoiceInput'

interface AgentChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export function AgentChatInput({ onSend, disabled }: AgentChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { recording, transcribing, startRecording, stopRecording, cancelRecording } = useVoiceInput()

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [value, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleVoiceToggle = useCallback(async () => {
    if (recording) {
      const text = await stopRecording()
      if (text) {
        onSend(text)
      }
    } else {
      await startRecording()
    }
  }, [recording, startRecording, stopRecording, onSend])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  return (
    <div className="fixed left-0 right-0 border-t border-neutral-200/60 bg-bg-elevated/95 backdrop-blur-lg z-50"
         style={{ bottom: 'calc(2.5rem + max(0px, calc(env(safe-area-inset-bottom, 0px) - 8px)))' }}>
      <div className="flex items-end gap-2 px-3 pt-2 pb-1">
        {/* Voice button */}
        <button
          onClick={handleVoiceToggle}
          disabled={disabled || transcribing}
          className={`flex-shrink-0 p-2 rounded-xl transition-all ${
            recording
              ? 'bg-red-500 text-white animate-pulse'
              : transcribing
              ? 'bg-neutral-200 text-neutral-400'
              : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
          }`}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
        >
          {transcribing ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || recording || transcribing}
          placeholder={recording ? 'Listening...' : transcribing ? 'Transcribing...' : 'Message Michael...'}
          rows={1}
          className="flex-1 resize-none bg-neutral-100/80 rounded-xl px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 transition-all"
          style={{ maxHeight: '120px' }}
        />

        {/* Send button */}
        {value.trim() && (
          <button
            onClick={handleSubmit}
            disabled={disabled}
            className="flex-shrink-0 p-2 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            aria-label="Send"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        )}
      </div>

      {/* Cancel recording hint */}
      {recording && (
        <div className="text-center pb-1">
          <button
            onClick={cancelRecording}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            tap mic to send, or cancel
          </button>
        </div>
      )}
    </div>
  )
}
