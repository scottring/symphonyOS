import { useState, type FormEvent } from 'react'

interface ChatInputProps {
  onSend?: (text: string) => void
  disabled?: boolean
}

/** Bottom input row with italic placeholder and small primary send button.
 *  Stub: submission is a no-op unless `onSend` is wired in. */
export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSend?.(trimmed)
    setValue('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-neutral-200 bg-bg-elevated px-4 py-3"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Ask anything about your plan…"
        className="flex-1 bg-transparent text-sm italic text-neutral-700 placeholder:italic placeholder:text-neutral-400 focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {/* Up-arrow send glyph */}
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 13V3" />
          <path d="M3.5 7.5 8 3l4.5 4.5" />
        </svg>
      </button>
    </form>
  )
}
