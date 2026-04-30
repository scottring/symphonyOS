import { useCallback } from 'react'
import { UserBubble } from './UserBubble'
import { AiBody } from './AiBody'
import { SuggestionCard } from './SuggestionCard'
import { ChatInput } from './ChatInput'
import type { Message, Suggestion } from './types'

export interface AskSymphonyRailProps {
  isOpen: boolean
  onClose: () => void
  onApplySuggestion?: (suggestion: Suggestion) => void
  onPreviewSuggestion?: (suggestion: Suggestion) => void
}

/** Hardcoded conversation for the v3 stub. Real LLM wiring lands later. */
const STUB_MESSAGES: Message[] = [
  {
    role: 'user',
    id: 'u-1',
    text: "Make Tuesday's dinner kid-friendlier.",
  },
  {
    role: 'ai',
    id: 'a-1',
    text: 'Absolutely. Here are 2 options that keep the spirit but are easier for the kids.',
    suggestions: [
      {
        id: 's-1',
        kicker: 'Tuesday dinner — Kid-friendly swap',
        originalLabel: 'Original',
        originalRecipe: 'Bittman shrimp (broiled)',
        switchLabel: 'Switch to',
        switchRecipe: 'Creamy lemon shrimp pasta with peas',
        why: 'Why this works: familiar, mild flavors, easy to portion.',
      },
      {
        id: 's-2',
        kicker: 'Reduce Wednesday’s prep time',
        originalLabel: 'Original',
        originalRecipe: 'Slow-roasted pork shoulder (3 hr)',
        switchLabel: 'Switch to',
        switchRecipe: 'Sheet-pan miso salmon + rice (25 min)',
        why: 'Why this works: same protein-forward energy, weeknight-fast.',
      },
    ],
  },
]

/** Surface 5 — Symphony AI side rail.
 *  380px right-fixed panel. Slides in when `isOpen`. Stub conversation;
 *  Apply/Preview buttons call props if provided, otherwise no-op. */
export function AskSymphonyRail({
  isOpen,
  onClose,
  onApplySuggestion,
  onPreviewSuggestion,
}: AskSymphonyRailProps) {
  const handleApply = useCallback(
    (s: Suggestion) => {
      if (onApplySuggestion) onApplySuggestion(s)
      else console.log('[AskSymphonyRail] apply suggestion (no handler):', s)
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
    // Stub: no LLM yet. Log for dev visibility.
    console.log('[AskSymphonyRail] user message (stub):', text)
  }, [])

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
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {STUB_MESSAGES.map((msg) =>
          msg.role === 'user' ? (
            <UserBubble key={msg.id} text={msg.text} />
          ) : (
            <AiBody key={msg.id} text={msg.text}>
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="space-y-2">
                  {msg.suggestions.map((s) => (
                    <SuggestionCard
                      key={s.id}
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
      </div>

      {/* Footer input */}
      <ChatInput onSend={handleSend} />
    </aside>
  )
}
