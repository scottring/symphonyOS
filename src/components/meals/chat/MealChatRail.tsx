import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import type { ChatMsg } from '@/hooks/useMealPlannerChat'

export interface MealChatRailProps {
  messages: ChatMsg[]
  busy: boolean
  /** True while the persisted transcript is loading — suppresses the empty-state
   *  prompt so it doesn't flash before saved messages arrive. */
  loadingHistory?: boolean
  /** Current tool name while the assistant is writing to the plan; null when idle. */
  toolActivity: string | null
  onSend: (text: string) => void
  className?: string
}

/** Message list + input for meal-planning chat. Presentational shell shared
 *  by the desktop rail (PlanPage) and the mobile bottom sheet
 *  (MealChatSheet) — grid updates land via useMealPlan's own realtime
 *  subscription, this component only carries the conversation. */
export function MealChatRail({ messages, busy, loadingHistory, toolActivity, onSend, className }: MealChatRailProps) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, toolActivity])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    onSend(text)
    setDraft('')
  }

  const handlePlanWeek = () => {
    if (busy) return
    onSend('Plan my week — propose a seasonal menu for the week.')
  }

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      <div className="px-5 py-4 border-b border-neutral-100 shrink-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">Plan with AI</div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        {loadingHistory && messages.length === 0 && (
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-neutral-400">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            Loading…
          </div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div className="space-y-3">
            <p className="font-display italic text-[0.95rem] text-neutral-400">
              Try "taco tuesday" for a direct edit, or let me propose a seasonal week.
            </p>
            <button
              type="button"
              onClick={handlePlanWeek}
              disabled={busy}
              className="btn-primary px-3 py-2 text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Sparkles className="w-4 h-4" />
              Plan my week
            </button>
          </div>
        )}
        {messages.map((m, i) => {
          const showSpinner = m.pending && !m.content
          const text = showSpinner
            ? null
            : (m.content || (m.role === 'assistant' && !m.pending ? 'Done — check the plan.' : ''))
          return (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <div
                className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary-500 text-white'
                    : 'bg-neutral-100 text-neutral-800'
                }`}
              >
                {showSpinner
                  ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Thinking…" />
                  : text}
              </div>
            </div>
          )
        })}
        {toolActivity && (
          <div className="text-[11px] italic text-neutral-400 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            updating the plan…
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-neutral-100 flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Plan this week…"
          disabled={busy}
          aria-label="Message the meal planner"
          className="input-base text-[13px] py-2 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send"
          className="btn-primary px-3 py-2 disabled:opacity-40 shrink-0"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  )
}
