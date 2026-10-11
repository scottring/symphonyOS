// src/components/overview/HomePage.tsx
//
// Home: the page you come back to for your bearings (Scott, 2026-10-11 —
// "it's PERFECT, ship it"; mockup https://claude.ai/artifact/PphxtskNXVv9KU8GGnqH5M).
// One screen, in sentences, each a door to the page that does the work:
// a suggested next step, today, what is waiting on you, where you are in the
// plan, and everything else. Today stays the page the app opens on; the
// Symphony mark (desktop) and the dock's Home (phone) come here. The place's
// landscape stands at full strength below it (PlaceScenery `vivid`).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight, BookOpen, FileText, Home as HouseIcon, Inbox, List, MessageCircle, NotebookText, Repeat, RotateCcw, Users, UtensilsCrossed,
} from 'lucide-react'
import { GoalsProvider } from '@/contexts/GoalsContext'
import { useHomeBearings, type Rung } from '@/hooks/useHomeBearings'
import { useWeather } from '@/hooks/useWeather'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { connectedDestination } from '@/lib/planning/connectedDestination'
import { chooseNextStep, count, greeting, lensLine, nextUp, timeRange, type NextStepId } from '@/lib/home/bearings'

const SET_ASIDE_KEY = 'symphony-home-set-aside'

/** "Not now" sets a suggestion aside for the rest of the day, on this device. */
function readSetAside(day: string): Set<NextStepId> {
  try {
    const raw = JSON.parse(localStorage.getItem(SET_ASIDE_KEY) ?? 'null') as { day?: string; ids?: NextStepId[] } | null
    return new Set(raw?.day === day ? raw.ids ?? [] : [])
  } catch { return new Set() }
}

/** The clock, a minute at a time, so "next up" stays true while the page is open. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

const LIBRARY = [
  { label: 'Routines', hint: 'What repeats, and who does it', to: '/routines', Icon: Repeat },
  { label: 'Meals', hint: 'This week’s dinners and recipes', to: '/meals/plan', Icon: UtensilsCrossed },
  { label: 'Lists', hint: 'Groceries, to buy, packing', to: '/lists', Icon: List },
  { label: 'Notes', hint: 'Everything you’ve written down', to: '/notes', Icon: NotebookText },
  { label: 'Contacts', hint: 'People and places you call', to: '/contacts', Icon: Users },
  { label: 'Documents', hint: 'Forms, scans and files', to: '/documents', Icon: FileText },
  { label: 'House', hint: 'Rooms, appliances, upkeep', to: '/home', Icon: HouseIcon },
  { label: 'Planning guide', hint: 'Plan from paper, or be walked through it', to: '/guide', Icon: BookOpen },
]

export function HomePage() {
  return <GoalsProvider><HomeInner /></GoalsProvider>
}

function HomeInner() {
  const now = useMinute()
  const { search } = useLocation()
  const go = useCallback((to: string) => connectedDestination(to, search), [search])
  const b = useHomeBearings(now)
  const { weather } = useWeather()
  const { layers } = useDomain()
  const [people] = useAssigneeFilter()
  const { members: familyMembers } = useFamilyMembers()

  const day = now.toDateString()
  const [setAside, setSetAside] = useState(() => readSetAside(day))
  useEffect(() => { setSetAside(readSetAside(day)) }, [day])
  const notNow = (id: NextStepId) => {
    const next = new Set(setAside).add(id)
    setSetAside(next)
    try { localStorage.setItem(SET_ASIDE_KEY, JSON.stringify({ day, ids: [...next] })) } catch { /* private window: this visit only */ }
  }

  const step = useMemo(() => chooseNextStep(b.facts, setAside), [b.facts, setAside])
  const up = nextUp(b.events, now)
  const peopleNames = people.map((id) => id === 'unassigned' ? 'nobody in particular' : familyMembers.find((m) => m.id === id)?.name ?? 'someone')
  const lens = lensLine(layers, peopleNames)
  const dateLine = [
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    weather ? `${Math.round(weather.currentTemp)}° and ${weather.condition.toLowerCase()}` : null,
  ].filter(Boolean).join(' · ')

  // Waiting on you: only what needs a decision, and never the suggestion again.
  const waiting: { key: string; Icon: typeof Inbox; text: string; label: string; to: string }[] = []
  if (b.facts.inbox > 0 && step.id !== 'sort-inbox') {
    waiting.push({ key: 'inbox', Icon: Inbox, text: `${count(b.facts.inbox, 'capture').replace(/^./, (c) => c.toUpperCase())} in the Inbox.`, label: 'Sort the Inbox', to: '/inbox' })
  }
  for (const d of b.discussions.slice(0, 2)) {
    waiting.push({ key: d.sessionId, Icon: MessageCircle, text: `${d.title} — ${d.lastAuthor ? `${d.lastAuthor} wrote` : 'something new'}.`, label: 'Answer', to: '/discussions' })
  }
  if (b.discussions.length > 2) {
    waiting.push({ key: 'more-discussions', Icon: MessageCircle, text: `${count(b.discussions.length - 2, 'more discussion')} with something new.`, label: 'Open discussions', to: '/discussions' })
  }
  for (const lvl of ['month', 'season'] as const) {
    const f = b.facts[lvl]
    if (f.review > 0 && step.id !== `look-back-${lvl}`) {
      waiting.push({ key: `review-${lvl}`, Icon: RotateCcw, text: `${f.reviewName} closed with ${count(f.review, 'open line')}. Carry, drop, or call them done.`, label: 'Look back', to: `/${lvl}` })
    }
  }

  return (
    <div className="home-page">
      <header className="home-masthead">
        <span aria-hidden="true" className="masthead-numeral">{now.getDate()}</span>
        <div className="home-masthead-words">
          <h1>{greeting(now)}{b.firstName ? `, ${b.firstName}` : ''}</h1>
          <p>{dateLine}</p>
          {lens && <p className="home-lens">{lens}</p>}
        </div>
      </header>

      <section className="home-next home-card" aria-labelledby="home-next-title">
        <div className="home-next-words">
          <p className="home-eyebrow">A good next step</p>
          <h2 id="home-next-title">{step.title}</h2>
          <p>{step.body}</p>
        </div>
        <div className="home-next-actions">
          <Link to={go(step.action.to)} className="home-button is-primary">{step.action.label}<ArrowRight size={16} aria-hidden="true" /></Link>
          {step.id !== 'do-today' && <button type="button" className="home-button" onClick={() => notNow(step.id)}>Not now</button>}
        </div>
      </section>

      <div className="home-pair">
        <section className="home-today" aria-labelledby="home-today-title">
          <div className="home-section-head">
            <h2 id="home-today-title">Today</h2>
            <Link to={go('/today')}>Open Today</Link>
          </div>
          <p className="home-sentence">
            {up
              ? <>{up.lead} <strong>{up.what}</strong>{up.rest}</>
              : b.calendarConnected
                ? b.events.length ? 'Nothing else is on the calendar today.' : 'Nothing is on the calendar today.'
                : 'Connect a calendar in Settings and your appointments will show here.'}
          </p>
          {(b.events.length > 0 || b.allDay.length > 0 || b.chosen.length > 0) && (
            <ul className="home-day">
              {b.allDay.map((title) => (
                <li key={`all-${title}`} className="home-day-row"><span className="home-day-when">All day</span><span className="home-day-what"><span className="home-event-bar" aria-hidden="true" />{title}</span></li>
              ))}
              {b.events.map((e) => (
                <li key={e.id} className={`home-day-row${e.end <= now ? ' is-past' : ''}`}>
                  <span className="home-day-when">{timeRange(e.start, e.end)}</span>
                  <span className="home-day-what"><span className="home-event-bar" aria-hidden="true" />{e.title}</span>
                </li>
              ))}
              {b.chosen.map((t, i) => (
                <li key={t.id} className="home-day-row">
                  <span className="home-day-when">{i === 0 ? 'For today' : ''}</span>
                  <span className="home-day-task">
                    <span className="home-day-what"><span className="home-task-ring" aria-hidden="true" />{t.title}</span>
                    {t.forLine && <span className="home-day-for">↳ for {t.forLine}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {waiting.length > 0 && (
          <section className="home-waiting home-card" aria-labelledby="home-waiting-title">
            <h2 id="home-waiting-title">Waiting on you</h2>
            <ul>
              {waiting.map(({ key, Icon, text, label, to }) => (
                <li key={key}>
                  <Icon size={18} aria-hidden="true" />
                  <div>
                    <span>{text}</span>
                    <Link to={go(to)} className="home-pill">{label}</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="home-where" aria-labelledby="home-where-title">
        <div className="home-section-head">
          <h2 id="home-where-title">Where you are</h2>
          <span>Lists above the week are for looking. The week and the day are for doing.</span>
        </div>
        <ol className="home-ladder">
          {b.rungs.map((r) => <RungItem key={r.level} rung={r} to={go(r.to)} />)}
        </ol>
      </section>

      <section className="home-library" aria-labelledby="home-library-title">
        <div className="home-section-head"><h2 id="home-library-title">Everything else</h2></div>
        <ul>
          {LIBRARY.map(({ label, hint, to, Icon }) => (
            <li key={to}>
              <Link to={go(to)}>
                <Icon size={18} aria-hidden="true" />
                <span><span className="home-library-label">{label}</span><span className="home-library-hint">{hint}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function RungItem({ rung, to }: { rung: Rung; to: string }) {
  const here = rung.level === 'today'
  return (
    <li className={`home-rung${here ? ' is-here' : ''}${rung.attention ? ' needs-attention' : ''}`} aria-current={here ? 'step' : undefined}>
      <Link to={to}>
        <span className="home-rung-mark" aria-hidden="true"><span className="home-rung-dot" /><span className="home-rung-line" /></span>
        {here && <span className="home-rung-here">You are here</span>}
        <span className="home-rung-name">{rung.name}</span>
        <span className="home-rung-status">{rung.status}</span>
        {rung.sample && <span className="home-rung-sample">“{rung.sample}”</span>}
      </Link>
    </li>
  )
}
