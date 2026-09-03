// src/components/discussion/DiscussionComposer.tsx
//
// The bottom of a Discussion: write to the people in the thread, or invite
// Symphony. Two ways to invite — the quieter "Ask Symphony" button, or opening
// the message with "@Symphony" — and nothing else ever wakes the assistant.
// Enter sends, Shift+Enter breaks a line.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { mentionsSymphony, parseComposer } from '@/lib/discussions/composer'

interface DiscussionComposerProps {
  onPost: (text: string) => void
  onAsk: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

const MIN_HEIGHT = 44
const MAX_HEIGHT = 160

export function DiscussionComposer({ onPost, onAsk, disabled = false, placeholder }: DiscussionComposerProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_HEIGHT), MAX_HEIGHT)}px`
  }, [value])

  const asking = mentionsSymphony(value)
  const empty = parseComposer(value).text.length === 0

  const submit = useCallback((forceAsk: boolean) => {
    if (disabled) return
    const intent = parseComposer(value)
    if (!intent.text) return
    if (forceAsk || intent.kind === 'ask') onAsk(intent.text)
    else onPost(intent.text)
    setValue('')
  }, [value, disabled, onAsk, onPost])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(false)
    }
  }, [submit])

  return (
    <div className="border-t border-neutral-200 bg-white px-3 pt-2.5 pb-3">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={1}
        aria-label="Message"
        placeholder={placeholder ?? 'Write a message… or @Symphony to ask'}
        className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50/60 px-3 py-2.5 text-sm leading-relaxed text-neutral-800 placeholder:text-neutral-400 focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
      />
      <div className="mt-2 flex items-center gap-2">
        {asking ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
            <ConceptIcon name="ai" size={12} decorative />
            Symphony will answer
          </span>
        ) : (
          <span className="text-[11px] text-neutral-400">Enter to send · Shift+Enter for a new line</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={disabled || empty}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-primary-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <ConceptIcon name="ai" size={14} decorative />
            Ask Symphony
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={disabled || empty}
            className="inline-flex items-center rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
