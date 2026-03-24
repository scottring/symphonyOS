import { useState, useCallback, useRef, useEffect } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  loading?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, loading = false, placeholder = 'Ask about this...' }: ChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [value])

  const handleSubmit = useCallback(() => {
    if (!value.trim() || loading) return
    onSend(value.trim())
    setValue('')
  }, [value, loading, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="flex items-end gap-2 p-3 border-t border-neutral-200 bg-white">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={loading}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
          disabled:opacity-50 placeholder:text-neutral-400"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || loading}
        className="flex-none w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center
          hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        )}
      </button>
    </div>
  )
}
