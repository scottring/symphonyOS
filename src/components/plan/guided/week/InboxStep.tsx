// Planning the week, step 4 (spec 2026-11-01): clear the inbox. Each capture
// gets one of three answers: This week, Later (next week, this month, next
// month) or Let go (out of the way, in Someday: nothing here deletes). The
// captures are the page's own (its space filter and people lens), and every
// answer saves through the deck's writers, with a receipt and Undo.

import { useState } from 'react'
import type { DeckCard } from '@/lib/planning/deck'
import type { DeckActions, LaterWhen } from '@/components/home/week/useDeckActions'

const LATER: { label: string; when: LaterWhen }[] = [
  { label: 'Next week', when: 'next-week' },
  { label: 'This month', when: 'this-month' },
  { label: 'Next month', when: 'next-month' },
]

export function InboxStep({ cards, actions }: {
  /** The Inbox, as the page shows it (the deck's inbox cards). */
  cards: readonly DeckCard[]
  actions: Pick<DeckActions, 'keepThisWeek' | 'later' | 'letGo'>
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [later, setLater] = useState<string | null>(null)

  const run = async (key: string, write: () => Promise<boolean>) => {
    setPending(key); setFailed(null); setLater(null)
    const ok = await write().catch(() => false)
    setPending(null)
    if (!ok) setFailed(key)
  }

  if (cards.length === 0) return <div className="gw-body"><p className="choose-empty">Inbox is clear.</p></div>
  return <div className="gw-body">
    <ul className="gw-rows" aria-label="Inbox">
      {cards.map((c) => {
        const t = c.task.title
        const busy = pending !== null
        return <li key={c.key} className="gw-row" aria-label={t}>
          <span className="gw-row-title">{t}</span>
          {c.facts && <span className="gw-row-note">{c.facts}</span>}
          <span className="gw-row-acts" role="group" aria-label={`File ${t}`}>
            <button type="button" className="choose-verb" disabled={busy} aria-label={`This week: ${t}`}
              onClick={() => { void run(c.key, () => actions.keepThisWeek(c)) }}>This week</button>
            <button type="button" className="choose-verb is-quiet" disabled={busy} aria-expanded={later === c.key} aria-label={`Later: ${t}`}
              onClick={() => setLater(later === c.key ? null : c.key)}>Later ▸</button>
            <button type="button" className="choose-verb is-quiet" disabled={busy} aria-label={`Let go: ${t}`}
              onClick={() => { void run(c.key, () => actions.letGo(c)) }}>Let go</button>
          </span>
          {later === c.key && <div className="choose-menu" role="group" aria-label={`Later: ${t}`}>
            {LATER.map((l) => <button key={l.when} type="button" className="choose-when" disabled={busy}
              onClick={() => { void run(c.key, () => actions.later(c, l.when)) }}>{l.label}</button>)}
          </div>}
          {pending === c.key && <p className="choose-status" role="status">Saving…</p>}
          {failed === c.key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
        </li>
      })}
    </ul>
  </div>
}
