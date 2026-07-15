// src/components/planning/guided/GuideChat.tsx
//
// Layer 2 of the session guide: the AI, scoped to THIS session and THIS step.
// Collapsed by default — the ritual works fully without it, and if the agent
// is offline the whole feature degrades to a quiet error line. Two doors:
//
//   · "Ask your guide" — a small chat whose every turn carries sessionContext
//     (horizon, step, the live lists), so questions like "what should I carry?"
//     need no re-explaining.
//   · "Suggest moves" (write-list steps only) — one canned ask for 3–5
//     level-sized moves, returned as tap-to-add chips. Tapping is the ONLY
//     write path; the guide never edits lists on its own.
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { MessageCircleQuestion, Send, Plus, Check, Wand2, X } from 'lucide-react'
import { streamSymphonyAgent, type AgentApiMessage, type AssistantSessionContext } from '@/lib/agentStream'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { parseSuggestions } from './parseSuggestions'
import { useGuided } from './GuidedContext'

interface ChatMsg { role: 'user' | 'assistant'; text: string }

const HORIZON_SIZE: Record<string, string> = {
  seasonal: 'season-sized (finishable in about three months)',
  monthly: 'month-sized (one concrete chunk — an order placed, a call made)',
  weekly: 'week-sized (a single sitting or errand)',
}

/** Remounts the panel per step (`key`), so chat/suggestion state resets
 *  without effects — a new step is a new conversation. */
export function GuideChat() {
  const { step } = useGuided()
  return <GuideChatPanel key={step.id} />
}

function GuideChatPanel() {
  const { step, host, horizon, periodLabel } = useGuided()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const [added, setAdded] = useState<Set<string>>(() => new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const match = useMemo(() => makeAssigneeFilter([]), [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [msgs, busy])

  const bucket = step.props?.bucket
  const above = step.props?.aboveBucket

  const sessionContext = useMemo<AssistantSessionContext>(() => {
    const titles = (b?: string) =>
      b ? host.tasks.filter((t) => !t.completed && t.bucket === b && match(t.assignedTo, t.assignedToAll)).map((t) => t.title).slice(0, 40) : undefined
    return {
      horizon,
      periodLabel,
      stepId: step.id,
      stepTitle: step.title,
      bucket,
      listTitles: titles(bucket),
      aboveTitles: above === 'goals' ? undefined : titles(above),
      goalNames: host.goals.filter((g) => g.status === 'active').map((g) => g.name).slice(0, 30),
    }
  }, [horizon, periodLabel, step.id, step.title, bucket, above, host.tasks, host.goals, match])

  const send = useCallback(async (text: string, opts?: { onReply?: (reply: string) => void; silent?: boolean }) => {
    setBusy(true); setError(null)
    const history: ChatMsg[] = opts?.silent ? msgs : [...msgs, { role: 'user', text }]
    if (!opts?.silent) setMsgs(history)
    const api: AgentApiMessage[] = [...history.map((m) => ({ role: m.role, content: m.text })), ...(opts?.silent ? [{ role: 'user' as const, content: text }] : [])]
    let streamed = ''
    await streamSymphonyAgent(api, {
      sessionContext,
      onText: (t) => {
        streamed = t
        if (!opts?.silent) setMsgs([...history, { role: 'assistant', text: t }])
      },
      onDone: (reply) => {
        const final = reply || streamed
        if (!opts?.silent) setMsgs([...history, { role: 'assistant', text: final }])
        opts?.onReply?.(final)
        setBusy(false)
      },
      onError: (message) => {
        setError(message === 'Assistant offline' ? 'Your guide is offline — the session works fine without it.' : message)
        setBusy(false)
      },
    })
  }, [msgs, sessionContext])

  const suggestMoves = useCallback(() => {
    if (!bucket) return
    setSuggestions([])
    void send(
      `Suggest 3 to 5 ${HORIZON_SIZE[horizon] ?? 'right-sized'} moves for my current list, drawing on the level above and my goals. ` +
      'Concrete, verb-first, each under 10 words. Return ONLY a JSON array of strings — no prose.',
      { silent: true, onReply: (reply) => setSuggestions(parseSuggestions(reply)) },
    )
  }, [bucket, horizon, send])

  const addSuggestion = useCallback((title: string) => {
    if (!bucket) return
    setAdded((prev) => new Set(prev).add(title))
    void host.createTaskInBucket(title, bucket)
  }, [bucket, host])

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void send(text)
  }, [draft, busy, send])

  // Narration/book-next moments don't need a coach hovering.
  if (step.type === 'narration' || step.type === 'book-next') return null

  if (!open) {
    return (
      <div className="flex items-center gap-2 pt-2">
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-neutral-500 hover:text-primary-700 hover:bg-primary-50 transition-colors">
          <MessageCircleQuestion className="w-3.5 h-3.5" /> Ask your guide
        </button>
        {step.type === 'write-list' && bucket && (
          <button type="button" onClick={() => { setOpen(true); suggestMoves() }}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-neutral-500 hover:text-primary-700 hover:bg-primary-50 transition-colors">
            <Wand2 className="w-3.5 h-3.5" /> Suggest moves
          </button>
        )}
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-primary-100 bg-primary-50/30 overflow-hidden" aria-label="Session guide">
      <header className="flex items-center justify-between px-3 py-2 border-b border-primary-100/70">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-800">
          <MessageCircleQuestion className="w-3.5 h-3.5" /> Your guide — knows this step
        </span>
        <div className="flex items-center gap-1">
          {step.type === 'write-list' && bucket && (
            <button type="button" onClick={suggestMoves} disabled={busy}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-40">
              <Wand2 className="w-3 h-3" /> Suggest moves
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close guide"
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-primary-100 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {(msgs.length > 0 || busy) && (
        <div ref={scrollRef} className="max-h-56 overflow-y-auto px-3 py-2 space-y-2">
          {msgs.map((m, i) => (
            <p key={i} className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
              m.role === 'user' ? 'text-neutral-800 font-medium' : 'text-neutral-600'}`}>
              {m.role === 'user' ? '— ' : ''}{m.text}
            </p>
          ))}
          {busy && <p className="text-[13px] text-neutral-400 italic">thinking…</p>}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => {
            const done = added.has(s)
            return (
              <button key={s} type="button" disabled={done} onClick={() => addSuggestion(s)}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border transition-colors ${
                  done
                    ? 'text-primary-700 bg-primary-100 border-primary-200'
                    : 'text-neutral-700 bg-white border-neutral-200 hover:border-primary-300 hover:text-primary-700'}`}>
                {done ? <Check className="w-3 h-3" strokeWidth={3} /> : <Plus className="w-3 h-3" />} {s}
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="px-3 py-1.5 text-xs text-amber-700">{error}</p>}

      <div className="flex items-center gap-2 px-3 py-2 border-t border-primary-100/70">
        <input type="text" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Ask about this step — what to carry, how to break something down…"
          className="flex-1 min-w-0 text-[13px] bg-transparent placeholder:text-neutral-400 focus:outline-none"
        />
        <button type="button" onClick={submit} disabled={busy || !draft.trim()} aria-label="Send"
          className="shrink-0 p-1.5 rounded-md text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-40">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  )
}
