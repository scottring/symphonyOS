import { useCallback, useEffect, useRef } from 'react'
import { UserBubble } from './UserBubble'
import { AiBody } from './AiBody'
import { SuggestionCard } from './SuggestionCard'
import { ChatInput } from './ChatInput'
import { useAskSymphony } from '@/hooks/useAskSymphony'
import type { Suggestion } from './types'

export interface AskSymphonyRailProps {
  isOpen: boolean
  weekStart: Date
  onClose: () => void
  onApplySuggestion?: (suggestion: Suggestion) => void | Promise<void>
  onPreviewSuggestion?: (suggestion: Suggestion) => void
}

/** Surface 5 — Symphony AI side rail.
 *  380px right-fixed panel. Slides in when `isOpen`. Real LLM-driven
 *  conversation via the `ask-symphony-meal` edge function. */
export function AskSymphonyRail({
  isOpen,
  weekStart,
  onClose,
  onApplySuggestion,
  onPreviewSuggestion,
}: AskSymphonyRailProps) {
  const { messages, busy, send } = useAskSymphony(weekStart)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const handleApply = useCallback(
    (s: Suggestion) => {
      if (onApplySuggestion) {
        void onApplySuggestion(s)
      } else {
        console.log('[AskSymphonyRail] apply suggestion (no handler):', s)
      }
    },
    [onApplySuggestion],
  )

  const handlePreview = useCallback(
    (s: Suggestion) => {
      if (onPreviewSuggestion) onPreviewSuggestion(s)
      else console.log('[AskSymphonyRail] preview suggestion (no handler):', s)
    },
    [onPreviewSuggestion],
  )

  const handleSend = useCallback((text: string) => {
    void send(text)
  }, [send])

  return (
    <aside
      aria-label="Symphony AI"
      aria-hidden={!isOpen}
      className={[
        'fixed top-0 right-0 bottom-0 z-40 flex w-[380px] flex-col bg-bg-elevated shadow-card',
        'border-l border-neutral-200',
        'transition-transform duration-300 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
        {/* Leaf glyph */}
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-primary-500"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M14 2c-5 0-9 3-10 7-.5 2 0 4 2 5 4 1 8-2 9-7 .3-1.7.5-3.5-1-5z" />
          </svg>
        </span>
        <h2 className="flex-1 text-sm font-medium text-neutral-800">Symphony AI</h2>
        <button
          type="button"
          aria-label="More options"
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <span className="text-base leading-none">…</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Symphony AI"
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !busy && (
          <p className="font-display text-sm italic text-neutral-400">
            Ask anything about this week — swaps, additions, kid-friendly tweaks…
          </p>
        )}

        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserBubble key={msg.id} text={msg.text} />
          ) : (
            <AiBody key={msg.id} text={msg.text}>
              {msg.cards && msg.cards.length > 0 && (
                <div className="space-y-2">
                  {msg.cards.map((s, i) => (
                    <SuggestionCard
                      key={`${msg.id}-${i}`}
                      suggestion={s}
                      onPreview={handlePreview}
                      onApply={handleApply}
                    />
                  ))}
                </div>
              )}
            </AiBody>
          ),
        )}

        {busy && (
          <div className="flex gap-3" aria-live="polite">
            <div
              aria-hidden
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white"
            >
              <span className="font-display text-[13px] italic leading-none">S</span>
            </div>
            <p className="text-sm italic leading-relaxed text-neutral-400">Thinking…</p>
          </div>
        )}
      </div>

      {/* Footer input */}
      <ChatInput onSend={handleSend} disabled={busy} />
    </aside>
  )
}
