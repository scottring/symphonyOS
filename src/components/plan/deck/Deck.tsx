// The deck: everything without a home this week, one card at a time, closest
// first, dealt in hands of five. Four choices per card, each saved through the
// canvas activity (so it has a receipt and an Undo); a decided card wears its
// stamp for a moment, then the next is dealt. The counter counts the hand,
// never the pile. Cards are read from the live `cards` prop on every pass, so
// one ticked off elsewhere (Iris, on the wall) is skipped, not shown stale.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HAND_SIZE, type DeckCard } from '@/lib/planning/deck'
import type { DeckActions } from '@/components/home/week/useDeckActions'
import { DeckCardView, type CardStamp, type DeckChoice } from './DeckCardView'
import type { StripDay } from './WeekStrip'

/** How long a stamped card stays before the next is dealt. */
const STAMP_HOLD_MS = 850

const short = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', opts).toLowerCase()

function stampFor(choice: DeckChoice): CardStamp {
  switch (choice.type) {
    case 'done': return { kind: 'done', context: 'done' }
    case 'day': return { kind: 'carried', context: short(choice.date, { weekday: 'short' }) }
    case 'no-day': return { kind: 'carried', context: 'this week' }
    case 'later': return { kind: 'someday', context: choice.label.toLowerCase() }
    case 'date': return { kind: 'someday', context: short(choice.date, { month: 'short', day: 'numeric' }) }
    case 'let-go': return { kind: 'dropped', context: 'let go' }
  }
}

function run(actions: DeckActions, card: DeckCard, choice: DeckChoice): Promise<boolean> {
  switch (choice.type) {
    case 'done': return actions.done(card)
    case 'day': return actions.placeOnDay(card, choice.date)
    case 'no-day': return actions.keepThisWeek(card)
    case 'later': return actions.later(card, choice.when)
    case 'date': return actions.laterOnDate(card, choice.date)
    case 'let-go': return actions.letGo(card)
  }
}

/** A screen's heading; it takes focus when it replaces something the user tapped. */
function Heading({ focus, children }: { focus: boolean; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (focus) ref.current?.focus({ preventScroll: true }) }, [focus])
  return <h1 ref={ref} tabIndex={-1} className="deck-h1">{children}</h1>
}

export function Deck({ cards, doneLastWeek, aged, onSeeAged, actions, stripDays, mode, onFinish, onExit }: {
  cards: DeckCard[]
  doneLastWeek: number
  aged: number
  onSeeAged: () => void
  actions: DeckActions
  stripDays: StripDay[]
  mode: 'full' | 'place'
  onFinish: (decided: ReadonlySet<string>) => void
  onExit: () => void
}) {
  const [started, setStarted] = useState(mode === 'place')
  const [decided, setDecided] = useState<ReadonlySet<string>>(() => new Set())
  // Fixed at the hand's first choice: min(HAND_SIZE, what was left then).
  const [handSize, setHandSize] = useState<number | null>(null)
  const [handCount, setHandCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [stamped, setStamped] = useState<{ card: DeckCard; stamp: CardStamp } | null>(null)
  const [touched, setTouched] = useState(false)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; clearTimeout(timer.current) }
  }, [])

  const live = cards.filter((c) => !c.task.completed && !decided.has(c.key))
  const size = handSize ?? Math.min(HAND_SIZE, live.length)

  const choose = async (card: DeckCard, choice: DeckChoice) => {
    if (busyRef.current || stamped) return
    busyRef.current = true
    setBusy(true)
    setTouched(true)
    setHandSize(size)
    let ok = false
    try { ok = await run(actions, card, choice) } catch { ok = false }
    if (!alive.current) return
    busyRef.current = false
    setBusy(false)
    // A failed or cancelled save keeps the card; the activity shows why.
    if (!ok) return
    setStamped({ card, stamp: stampFor(choice) })
    timer.current = setTimeout(() => {
      setDecided((prev) => new Set(prev).add(card.key))
      setHandCount((n) => n + 1)
      setStamped(null)
    }, STAMP_HOLD_MS)
  }

  const deal = () => { setTouched(true); setStarted(true); setHandSize(null); setHandCount(0) }

  const doneLine = <p className="deck-bignum"><b>{doneLastWeek}</b> done last week</p>
  const agedLine = aged > 0 && (
    <p className="deck-aged">
      {aged} older things, untouched for 3+ weeks, already went to Later on their own ·{' '}
      <button type="button" className="deck-link" onClick={onSeeAged}>See them</button>
    </p>
  )

  let body: ReactNode
  const current = stamped?.card ?? live[0]
  if (!current) {
    body = (
      <div className="deck-screen" key="empty">
        <Heading focus={touched}>Nothing left without a home</Heading>
        {mode === 'full' && !touched && <>{doneLine}{agedLine && <div className="deck-facts-block">{agedLine}</div>}</>}
        <div className="deck-next">
          <button type="button" className="deck-btn is-primary" onClick={() => onFinish(decided)}>Back to the week</button>
        </div>
      </div>
    )
  } else if (!started) {
    body = (
      <div className="deck-screen" key="intro">
        <Heading focus={false}>Where things go</Heading>
        {doneLine}
        <div className="deck-facts-block">
          <p>Everything without a home this week, one card at a time, closest first.</p>
          {agedLine}
        </div>
        <div className="deck-next">
          <button type="button" className="deck-btn is-primary" onClick={deal}>Deal the first hand</button>
        </div>
      </div>
    )
  } else if (!stamped && handSize !== null && handCount >= handSize) {
    const more = Math.min(HAND_SIZE, live.length)
    body = (
      <div className="deck-screen" key="hand-end">
        <Heading focus>That's a hand</Heading>
        <div className="deck-facts-block">
          <p>Stop here and anything left from last week goes to Later. The Inbox keeps its own.</p>
        </div>
        <div className="deck-next">
          <button type="button" className="deck-btn is-primary" onClick={() => onFinish(decided)}>That's enough for this week</button>
          <button type="button" className="deck-btn is-quiet" onClick={deal}>Deal {more} more</button>
        </div>
      </div>
    )
  } else {
    body = (
      <>
        <DeckCardView
          key={current.key}
          card={current}
          stripDays={stripDays}
          stamp={stamped?.stamp ?? null}
          busy={busy}
          focusOnMount={touched}
          onChoose={(choice) => { void choose(current, choice) }}
        />
        <p className="deck-counter">{handCount + 1} of {size}</p>
      </>
    )
  }

  return (
    <section className="deck" aria-label="The deck">
      <div className="deck-top">
        <span className="deck-kicker">The deck</span>
        <button type="button" className="deck-leave" onClick={onExit}>Leave</button>
      </div>
      {body}
    </section>
  )
}
