// src/components/voice/GuidePanel.tsx
//
// The typed guide inside a session: the person writes, the guide answers in
// a sentence or two and may propose lines. Each proposal is Add or Dismiss —
// Add puts it in the draft like a typed answer; only Save writes the plan.
// What asking sends is said right where it is asked, every time.

import { useRef, useState, type FormEvent } from 'react'
import { Check, Send, X } from 'lucide-react'
import { goalTitle, limitNote, LEVEL_NAME, type ExistingPlan, type FlowAction, type PeriodLabels, type VoicePlanDraft } from '@/lib/voiceOnboarding/flow'
import { guideRequest, guideSnapshot, proposalAction, MAX_TURNS, type AskGuide, type GuideProposal, type GuideTurn } from '@/lib/voiceOnboarding/guide'

interface Shown extends GuideProposal { key: string; state: 'open' | 'added' | 'dismissed' | 'refused'; note?: string }

export function GuidePanel({ draft, existing, labels, ask, apply }: {
  draft: VoicePlanDraft; existing: ExistingPlan; labels: PeriodLabels; ask: AskGuide
  /** Put an action in the draft; false when it was not taken. */
  apply: (a: FlowAction) => boolean
}) {
  const [turns, setTurns] = useState<GuideTurn[]>([])
  const [shown, setShown] = useState<Shown[]>([])
  const [goalOf, setGoalOf] = useState<Map<string, string>>(new Map())
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askedAbout, setAskedAbout] = useState<string | null>(null)
  // Proposals are offered only while the page is still on what they were
  // asked about (horizon, session, visible goals); after a move they go.
  const now = guideSnapshot(draft, existing)
  const current = askedAbout === now
  const latest = useRef(0)

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const said = text.trim()
    if (!said || busy) return
    const next: GuideTurn[] = [...turns, { role: 'user' as const, text: said }].slice(-MAX_TURNS)
    const asked = guideSnapshot(draft, existing)
    const n = ++latest.current
    // Built now, from the draft checked against what the person may see now.
    const { request, goalOf: refs } = guideRequest(draft, existing, labels, next)
    setBusy(true)
    setError(null)
    try {
      const r = await ask(request)
      if (n !== latest.current) return // a newer question was asked meanwhile
      setTurns([...next, { role: 'assistant' as const, text: r.reply }].slice(-MAX_TURNS))
      setGoalOf(refs)
      setAskedAbout(asked)
      setShown(r.proposals.filter((p) => p.level === request.horizon).map((p, i) => ({ ...p, key: `${n}-${i}`, state: 'open' })))
      setText('')
    } catch (err) {
      // What they wrote stays in the box; the plan and typing are untouched.
      setError(err instanceof Error ? err.message : 'The guide could not answer just now.')
    } finally {
      if (n === latest.current) setBusy(false)
    }
  }

  const add = (p: Shown) => {
    // Checked again at the tap: the page must still be where it was asked.
    const a = current ? proposalAction(p, goalOf, p.level) : null
    const taken = a ? apply(a) : false
    const kind = p.level === 'year' ? 'goal' : p.level === 'today' ? 'today' : 'week'
    setShown((s) => s.map((x) => (x.key === p.key
      ? taken ? { ...x, state: 'added' } : { ...x, state: 'refused', note: limitNote(draft, kind) ?? 'Not added — it’s already there, or its goal left this session.' }
      : x)))
  }

  const goalName = (ref: string | null) => (ref && goalOf.get(ref) ? goalTitle(draft, goalOf.get(ref)!) : 'No goal')

  return (
    <section className="vo-guide" aria-label="Plan with the guide">
      <p className="vo-mini-head">Talk it over with the guide (optional)</p>
      {turns.length > 0 && (
        <ol className="vo-guide-turns" aria-label="Conversation with the guide">
          {turns.map((t, i) => <li key={i} className={`is-${t.role}`}><span className="sr-only">{t.role === 'user' ? 'You' : 'Guide'}: </span>{t.text}</li>)}
        </ol>
      )}
      {shown.length > 0 && !current && <p className="vo-fine" role="status">The guide’s suggestions were for another step; ask again here.</p>}
      {shown.length > 0 && current && (
        <ul className="vo-guide-proposals" aria-label="Suggested lines">
          {shown.map((p) => (
            <li key={p.key} className={`is-${p.state}`}>
              <span className="vo-guide-level">{LEVEL_NAME[p.level]} · {goalName(p.goal)}</span>
              <span className="vo-guide-text">{p.text}</span>
              {p.state === 'open' && <>
                <button type="button" className="vo-secondary vo-secondary-sm" onClick={() => add(p)}><Check size={14} aria-hidden /> Add</button>
                <button type="button" className="vo-icon-sm" onClick={() => setShown((s) => s.map((x) => (x.key === p.key ? { ...x, state: 'dismissed' } : x)))} aria-label={`Dismiss “${p.text}”`}><X size={14} aria-hidden /></button>
              </>}
              {p.state === 'added' && <span className="vo-tag is-new">Added to this session</span>}
              {p.state === 'dismissed' && <span className="vo-tag">Dismissed</span>}
              {p.state === 'refused' && <span className="vo-limit" role="status">{p.note}</span>}
            </li>
          ))}
        </ul>
      )}
      <form className="vo-answer" onSubmit={send}>
        <input className="vo-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={600}
          placeholder="Think out loud — e.g. “I want to get strong: food, kit, and training”" aria-label="Message to the guide" aria-describedby="vo-guide-sends" />
        <button type="submit" className="vo-secondary" disabled={busy || !text.trim()}><Send size={14} aria-hidden /> {busy ? 'Asking…' : 'Ask'}</button>
      </form>
      <p className="vo-fine" id="vo-guide-sends">
        Asking sends your message and this session’s goals and lines — only what this page shows — to Symphony’s AI guide (run by Anthropic). It only suggests: nothing joins your plan unless you tap Add, and nothing is saved until Save.
      </p>
      {error && <p className="vo-error" role="alert">{error} Your plan is unchanged, and typing on the page still works.</p>}
    </section>
  )
}
