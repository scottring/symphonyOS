// src/components/overview/HomePage.tsx
//
// Home: the page you come back to for your bearings (Scott, 2026-10-11 —
// "it's PERFECT, ship it"; mockup https://claude.ai/artifact/PphxtskNXVv9KU8GGnqH5M).
// One screen, in sentences, each a door to the page that does the work:
// a suggested next step, today, what is waiting on you, where you are in the
// plan, and everything else. Today stays the page the app opens on; the
// Symphony mark (desktop) and the dock's Home (phone) come here. The place's
// landscape stands at full strength below it (PlaceScenery `vivid`).
//
// Dashboard pass (Scott, 2026-10-18 — "much more beautiful … more graphical
// and dashboardy"): the same facts and doors, drawn — glance tiles, the day
// as a ribbon with a now line, the cascade as connected cards with how far
// through each period is, the library as tiles.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Check, Clock, FileText, Home as HouseIcon, Inbox, List, MessageCircle, NotebookText, Repeat, RotateCcw, Sparkles, Users, UtensilsCrossed,
} from 'lucide-react'
import { GoalsProvider } from '@/contexts/GoalsContext'
import { useHomeBearings, type Rung, type TodayRow } from '@/hooks/useHomeBearings'
import { useWeather } from '@/hooks/useWeather'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { connectedDestination } from '@/lib/planning/connectedDestination'
import { chooseNextStep, clock, count, greeting, inTime, lensLine, lookBackPath, timeRange, type NextStepId } from '@/lib/home/bearings'

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
  const ahead = b.events.filter((e) => e.end > now)
  const up = ahead[0] ?? null
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
      waiting.push({ key: `review-${lvl}`, Icon: RotateCcw, text: `${f.reviewName} closed with ${count(f.review, 'open line')}. Carry, drop, or call them done.`, label: 'Look back', to: lookBackPath(lvl, f) })
    }
  }

  const doneToday = b.events.filter((e) => e.done).length
  const weekRung = b.rungs.find((r) => r.level === 'week')
  // The first row still to come: the now line is drawn just above it.
  const nowAt = b.events.findIndex((e) => e.end > now && !e.done)

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

      {/* Nothing below speaks until everything it reads has arrived: an
          unloaded month must not read "Nothing yet", nor an unloaded week
          prompt "Plan the week". */}
      {!b.loaded ? <p className="home-loading" role="status">Getting your bearings…</p> : <>
      <section className="home-next home-card" aria-labelledby="home-next-title">
        <span className="home-next-mark" aria-hidden="true"><Sparkles size={22} /></span>
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

      {/* At a glance: the same facts as the sections below, as figures. */}
      <ul className="home-glance" aria-label="At a glance">
        <li>
          <Link to={go('/today')} className="home-tile">
            <span className="home-tile-label"><Clock size={14} aria-hidden="true" />{up && up.start <= now ? 'On now' : 'Next up'}</span>
            {up ? <>
              <span className="home-tile-figure">{up.start <= now ? `until ${clock(up.end)}` : clock(up.start)}</span>
              <span className="home-tile-title">{up.title}</span>
              <span className="home-tile-note">{up.start > now ? inTime(now, up.start) : ahead[1] ? `Then ${ahead[1].title} at ${clock(ahead[1].start)}` : 'The last thing with a time today'}</span>
            </> : <>
              <span className="home-tile-figure is-quiet">Clear</span>
              <span className="home-tile-note">{b.events.length
                ? 'Nothing else has a time today.'
                : b.calendarConnected || b.calendarLoading
                  ? 'Nothing has a time today.'
                  : 'Nothing has a time today. Connect a calendar in Settings and your appointments will show here too.'}</span>
            </>}
          </Link>
        </li>
        <li>
          <Link to={go('/today')} className="home-tile is-ring">
            <Ring done={doneToday} total={b.events.length} />
            <span className="home-tile-words">
              <span className="home-tile-label">The day</span>
              <span className="home-tile-title">{b.events.length ? `${doneToday} of ${b.events.length} done` : 'Nothing timed'}</span>
              <span className="home-tile-note">{b.chosen.length ? `${b.chosen.length} chosen` : 'Nothing chosen'}{b.allDay.length ? ` · ${b.allDay.length} all day` : ''}</span>
            </span>
          </Link>
        </li>
        <li>
          <Link to={go('/week')} className={`home-tile${weekRung?.attention ? ' needs-attention' : ''}`}>
            <span className="home-tile-label">{weekRung?.name ?? 'This week'}{!b.facts.week.planned && <span className="home-tile-flag">Not planned</span>}</span>
            <span className="home-tile-figure">{b.facts.week.open}<small>no day yet</small></span>
            {weekRung?.through && <WeekDays day={weekRung.through.day} />}
            <span className="home-tile-note">{b.facts.week.done} done this week</span>
          </Link>
        </li>
        <li>
          <Link to={go('/inbox')} className="home-tile">
            <span className="home-tile-label"><Inbox size={14} aria-hidden="true" />Inbox</span>
            <span className={`home-tile-figure${b.facts.inbox ? '' : ' is-quiet'}`}>{b.facts.inbox}<small>{b.facts.inbox === 1 ? 'capture' : 'captures'}</small></span>
            <span className="home-tile-note">{b.discussions.length ? `${count(b.discussions.length, 'discussion')} with something new` : 'No discussions waiting'}</span>
          </Link>
        </li>
      </ul>

      <div className="home-pair">
        <section className="home-today home-card" aria-labelledby="home-today-title">
          <div className="home-section-head">
            <h2 id="home-today-title">Today</h2>
            <Link to={go('/today')}>Open Today</Link>
          </div>
          {b.events.length > 0 && <DayRibbon rows={b.events} now={now} />}
          {b.allDay.length > 0 && (
            <ul className="home-allday" aria-label="All day">
              <li className="home-allday-label" aria-hidden="true">All day</li>
              {b.allDay.map((title) => <li key={`all-${title}`} className="home-chip"><span className="home-event-bar" aria-hidden="true" />{title}</li>)}
            </ul>
          )}
          {b.events.length > 0 && (
            <ul className="home-day">
              {b.events.map((e, i) => (
                <li key={e.id} className={`home-day-row is-${e.kind}${e.end <= now || e.done ? ' is-past' : ''}${i === nowAt ? ' is-next' : ''}`}>
                  {i === nowAt && <span className="home-now-line" aria-hidden="true"><span>{clock(now)}</span></span>}
                  <span className="home-day-when">{timeRange(e.start, e.end)}</span>
                  {/* Marked apart as on the Week page: events a bar, routines a square, tasks a ring. */}
                  <span className="home-day-what"><span className={e.kind === 'event' ? 'home-event-bar' : e.kind === 'routine' ? 'home-routine-mark' : 'home-task-ring'} aria-hidden="true" />{e.title}</span>
                  {e.done && <Check size={14} className="home-day-done" aria-label="Done" />}
                </li>
              ))}
            </ul>
          )}
          {!b.events.length && !b.allDay.length && <p className="home-sentence">{b.calendarConnected || b.calendarLoading ? 'Nothing has a time today.' : 'Nothing has a time today. Connect a calendar in Settings and your appointments will show here too.'}</p>}
        </section>

        {(waiting.length > 0 || b.chosen.length > 0) && <div className="home-side">
          {waiting.length > 0 && (
            <section className="home-waiting home-card" aria-labelledby="home-waiting-title">
              <h2 id="home-waiting-title">Waiting on you <span className="home-count" aria-hidden="true">{waiting.length}</span></h2>
              <ul>
                {waiting.map(({ key, Icon, text, label, to }) => (
                  <li key={key}>
                    <span className="home-waiting-icon"><Icon size={16} aria-hidden="true" /></span>
                    <div>
                      <span>{text}</span>
                      <Link to={go(to)} className="home-pill">{label}</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {b.chosen.length > 0 && (
            <section className="home-chosen home-card" aria-labelledby="home-chosen-title">
              <h2 id="home-chosen-title">For today <span className="home-count" aria-hidden="true">{b.chosen.length}</span></h2>
              <ul>
                {b.chosen.map((t) => (
                  <li key={t.id}>
                    <span className="home-day-what"><span className="home-task-ring" aria-hidden="true" />{t.title}</span>
                    {t.forLine && <span className="home-day-for">↳ for {t.forLine}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>}
      </div>

      <section className="home-where" aria-labelledby="home-where-title">
        <div className="home-section-head">
          <h2 id="home-where-title">Where you are</h2>
          <span>Lists above the week are for looking. The week and the day are for doing.</span>
        </div>
        <ol className="home-ladder">
          {b.rungs.map((r) => <RungItem key={r.level} rung={r} to={go(r.to)} go={go} day={r.level === 'today' && b.events.length ? { done: doneToday, total: b.events.length } : undefined} />)}
        </ol>
      </section>

      </>}

      <section className="home-library" aria-labelledby="home-library-title">
        <div className="home-section-head"><h2 id="home-library-title">Everything else</h2></div>
        <ul>
          {LIBRARY.map(({ label, hint, to, Icon }) => (
            <li key={to}>
              <Link to={go(to)}>
                <span className="home-library-icon"><Icon size={18} aria-hidden="true" /></span>
                <span><span className="home-library-label">{label}</span><span className="home-library-hint">{hint}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Done of the day's timed things, as a ring. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const share = total ? done / total : 0
  return (
    <svg className="home-ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="home-ring-track" />
      <circle cx="32" cy="32" r={r} className="home-ring-fill" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle">{total ? `${Math.round(share * 100)}%` : '–'}</text>
    </svg>
  )
}

/** The week's seven days: gone, today, still ahead. */
function WeekDays({ day }: { day: number }) {
  return (
    <span className="home-weekdays" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => <span key={i} className={i + 1 < day ? 'is-gone' : i + 1 === day ? 'is-today' : undefined} />)}
    </span>
  )
}

/** The day drawn across its hours: each timed thing a block in its lane, and a line at now. */
function DayRibbon({ rows, now }: { rows: TodayRow[]; now: Date }) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hour = (d: Date) => (d.getTime() - midnight.getTime()) / 3_600_000
  const from = Math.max(0, Math.min(7, ...rows.map((r) => Math.floor(hour(r.start)))))
  const to = Math.min(24, Math.max(21, ...rows.map((r) => Math.ceil(hour(r.end)))))
  const at = (h: number) => ((Math.min(Math.max(h, from), to) - from) / (to - from)) * 100
  // Each mark takes the first lane free by its start. Something with a length
  // is a labelled bar; a moment (a routine, a timed task) is a pin.
  const lanes: number[] = []
  const blocks = rows.map((r) => {
    const start = hour(r.start)
    const moment = hour(r.end) - start < 0.25
    const end = moment ? start + (to - from) / 24 : hour(r.end)
    let lane = lanes.findIndex((free) => free <= start)
    if (lane < 0) { lane = lanes.length; lanes.push(end) } else lanes[lane] = end
    return { r, lane, moment, left: at(start), width: at(end) - at(start) }
  })
  const ticks: number[] = []
  for (let h = Math.ceil(from / 3) * 3; h <= to; h += 3) ticks.push(h)
  const nowH = hour(now)
  return (
    <div className="home-ribbon" aria-hidden="true" style={{ '--lanes': lanes.length } as CSSProperties}>
      <div className="home-ribbon-track">
        {ticks.map((h) => <span key={h} className="home-ribbon-tick" style={{ left: `${at(h)}%` }} />)}
        {nowH > from && nowH < to && <span className="home-ribbon-past" style={{ width: `${at(nowH)}%` }} />}
        {blocks.map(({ r, lane, moment, left, width }) => (
          <span key={r.id} title={`${timeRange(r.start, r.end)} ${r.title}`}
            className={`home-ribbon-block is-${r.kind}${moment ? ' is-moment' : ''}${r.done || r.end <= now ? ' is-past' : ''}`}
            style={{ left: `${left}%`, width: moment ? undefined : `${width}%`, top: `calc(${lane} * var(--lane-h) + 6px)` }}>
            {!moment && <span>{r.title}</span>}
          </span>
        ))}
        {nowH > from && nowH < to && <span className="home-ribbon-now" style={{ left: `${at(nowH)}%` }} />}
      </div>
      <div className="home-ribbon-hours">
        {ticks.map((h) => <span key={h} style={{ left: `${at(h)}%` }}>{h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</span>)}
      </div>
    </div>
  )
}

function RungItem({ rung, to, go, day }: { rung: Rung; to: string; go: (to: string) => string; day?: { done: number; total: number } }) {
  const here = rung.level === 'today'
  return (
    <li className={`home-rung${here ? ' is-here' : ''}${rung.attention ? ' needs-attention' : ''}`} aria-current={here ? 'step' : undefined}>
      <Link to={to}>
        {/* The mark row carries the label on the wide ladder, so every
            step's name sits on one line; the phone's column puts it after the name. */}
        <span className="home-rung-mark"><span className="home-rung-dot" aria-hidden="true" />{here ? <span className="home-rung-here">You are here</span> : <span className="home-rung-line" aria-hidden="true" />}</span>
        <span className="home-rung-name">{rung.name}{here && <span className="home-rung-here is-inline" aria-hidden="true">You are here</span>}</span>
        {rung.status && <span className="home-rung-status">{rung.status}</span>}
        {rung.through && <span className="home-rung-through">
          <span className="home-rung-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (rung.through.day / rung.through.days) * 100)}%` }} /></span>
          <span className="home-rung-day">Day {rung.through.day} of {rung.through.days}</span>
        </span>}
        {day && <span className="home-rung-through">
          <span className="home-rung-bar" aria-hidden="true"><span style={{ width: `${(day.done / day.total) * 100}%` }} /></span>
          <span className="home-rung-day">{day.done} of {day.total} with a time done</span>
        </span>}
        {rung.sample && <span className="home-rung-sample">“{rung.sample}”</span>}
      </Link>
      {/* Where the rhythm stands (Scott, 2026-10-17): last period reviewed,
          this one planned — ticked when done, a link to do it when not. */}
      {rung.steps && <ul className="home-rung-steps" aria-label={`${rung.name}: review and plan`}>
        {[rung.steps.review, rung.steps.plan].map((s) => <li key={s.label} className={s.done ? 'is-done' : undefined}>
          {s.done
            ? <span className="home-step"><Check size={14} aria-hidden="true" />{s.label}</span>
            : <Link className="home-step" to={go(s.to)}><span className="home-step-ring" aria-hidden="true" />{s.label} →</Link>}
          {s.dates && <span className="home-step-dates">{s.dates}</span>}
        </li>)}
      </ul>}
    </li>
  )
}
