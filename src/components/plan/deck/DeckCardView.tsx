// One card of the deck: where it came from, what it serves, its title and its
// facts, then four choices — Done · This week · Later · Let go. "This week"
// and "Later" open a reveal beneath; nothing is open, preselected or
// recommended until tapped. Once decided, the card wears its stamp.

import { useEffect, useRef, useState } from 'react'
import type { DeckCard, DeckSource } from '@/lib/planning/deck'
import type { LaterWhen } from '@/components/home/week/useDeckActions'
import { Stamp, type StampKind } from '@/components/plan/v2/Stamp'
import { WeekStrip, type StripDay } from './WeekStrip'

export type DeckChoice =
  | { type: 'done' }
  | { type: 'day'; date: Date }
  | { type: 'no-day' }
  | { type: 'later'; when: LaterWhen; label: string }
  | { type: 'date'; date: Date }
  | { type: 'let-go' }

export interface CardStamp { kind: StampKind; context: string }

const SOURCE: Record<DeckSource, string> = { 'this-week': 'This week', 'last-week': 'Last week', inbox: 'Inbox' }

const LATER: { when: LaterWhen; label: string }[] = [
  { when: 'next-week', label: 'Next week' },
  { when: 'this-month', label: 'This month' },
  { when: 'next-month', label: 'Next month' },
  { when: 'this-season', label: 'This season' },
  { when: 'someday', label: 'Someday' },
]

/** A native date input's "YYYY-MM-DD", as that day at local midnight. */
function localDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

export function DeckCardView({ card, stripDays, stamp, busy, focusOnMount, onChoose }: {
  card: DeckCard
  stripDays: StripDay[]
  stamp: CardStamp | null
  busy: boolean
  focusOnMount?: boolean
  onChoose: (choice: DeckChoice) => void
}) {
  const [reveal, setReveal] = useState<'week' | 'later' | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const locked = busy || !!stamp
  const toggle = (r: 'week' | 'later') => setReveal((cur) => (cur === r ? null : r))

  // A new card takes focus from the button that just unmounted, so the
  // keyboard keeps its place.
  useEffect(() => { if (focusOnMount) titleRef.current?.focus({ preventScroll: true }) }, [focusOnMount])

  return (
    <div className={`deck-stack${reveal === 'week' ? ' is-wide' : ''}`}>
      <div className="deck-ghost is-far" aria-hidden />
      <div className="deck-ghost" aria-hidden />
      <article className={`deck-card${stamp ? ' is-stamped' : ''}`} aria-busy={busy || undefined}>
        <span className="deck-src">{SOURCE[card.source]}</span>
        {card.serves && <p className="deck-serves">{card.serves}</p>}
        <h2 className="deck-title" ref={titleRef} tabIndex={-1}>{card.task.title}</h2>
        <p className="deck-facts">{card.facts}</p>

        <div className="deck-choices" role="group" aria-label="Where it goes">
          <button type="button" className="deck-btn" disabled={locked} onClick={() => onChoose({ type: 'done' })}>Done</button>
          <button type="button" className={`deck-btn${reveal === 'week' ? ' is-open' : ''}`} disabled={locked}
            aria-expanded={reveal === 'week'} onClick={() => toggle('week')}>This week</button>
          <button type="button" className={`deck-btn${reveal === 'later' ? ' is-open' : ''}`} disabled={locked}
            aria-expanded={reveal === 'later'} onClick={() => toggle('later')}>Later</button>
          <button type="button" className="deck-btn is-quiet" disabled={locked} onClick={() => onChoose({ type: 'let-go' })}>Let go</button>
        </div>

        {reveal === 'week' && (
          <div className="deck-reveal">
            <div className="deck-label">Tap a day · what's already there is shown</div>
            <WeekStrip
              days={stripDays}
              disabled={locked}
              onPick={(date) => onChoose({ type: 'day', date })}
              onNoDay={() => onChoose({ type: 'no-day' })}
            />
          </div>
        )}

        {reveal === 'later' && (
          <div className="deck-reveal">
            <div className="deck-label">When</div>
            <div className="deck-whens">
              {LATER.map((l) => (
                <button key={l.when} type="button" className={`deck-when${l.when === 'someday' ? ' is-quiet' : ''}`} disabled={locked}
                  onClick={() => onChoose({ type: 'later', when: l.when, label: l.label })}>{l.label}</button>
              ))}
              <label className={`deck-when is-quiet deck-when-date${locked ? ' is-disabled' : ''}`}>
                <span aria-hidden>Pick a date…</span>
                <input
                  type="date"
                  aria-label="Pick a date…"
                  disabled={locked}
                  onClick={(e) => { try { e.currentTarget.showPicker?.() } catch { /* the browser opens its own */ } }}
                  onChange={(e) => { const d = localDate(e.currentTarget.value); if (d) onChoose({ type: 'date', date: d }) }}
                />
              </label>
            </div>
          </div>
        )}

        {stamp && <Stamp kind={stamp.kind} context={stamp.context} fresh />}
      </article>
    </div>
  )
}
