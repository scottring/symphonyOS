// src/components/plan/v2/DatesCalendar.tsx
//
// "Dates we can't move": the period's shape, not its whole calendar. Closures,
// deadlines and stretches (all-day and multi-day entries) drawn as marks and
// bars across the days, the way a paper month shows a line over a call week.

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Landmark } from '@/lib/planning/v2/planV2'
import { readCadenceConfig, weekStartAnchor, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'

/** What the month has put on a week or a day — drawn as small marks. */
export interface CalMark { id: string; title: string }

// A day, and a week's number, are where a month's line can be put down
// (PlanPageV2: a date, or "that week"). Outside a DndContext they are inert.
function DayCell({ ymd, className, children, onPeek }: { ymd: string; className: string; children: ReactNode; onPeek: (el: HTMLElement | null) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `mday:${ymd}`, data: { kind: 'mday', ymd } })
  return <div ref={setNodeRef} className={`${className}${isOver ? ' is-over' : ''}`}
    onMouseEnter={(e) => onPeek(e.currentTarget)} onMouseLeave={() => onPeek(null)}>{children}</div>
}

/** What a hover shows: a day (its fixed dates and the plan's lines on it), or
 *  one fixed date (its days and what we are doing about it). */
type Peek = { kind: 'day'; ymd: string; at: { x: number; y: number } } | { kind: 'lm'; id: string; at: { x: number; y: number } }
const PEEK_W = 240
const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
function WeekCell({ ymd, n, marks, onOpen }: { ymd: string; n: number; marks: CalMark[]; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `mweek:${ymd}`, data: { kind: 'mweek', ymd } })
  return (
    <button ref={setNodeRef} type="button" className={`pv2-wkn${isOver ? ' is-over' : ''}`} onClick={onOpen}
      title={marks.length ? `Week ${n}: ${marks.map((m) => m.title).join(' · ')}` : `Week ${n}`} aria-label={`Open week ${n}`}>
      {n}{marks.length > 0 && <span className="pv2-pls" aria-hidden="true">{marks.slice(0, 3).map((m) => <i key={m.id} />)}</span>}
    </button>
  )
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dayIndex = (d: Date, weekStart: Date) => Math.round((d.getTime() - weekStart.getTime()) / 86400000)

export function DatesCalendar({ start, end, landmarks, today, selected, onSelect, onOpenWeek, available, planned, dayMarks, weekMarks }: {
  start: Date
  end: Date
  landmarks: Landmark[]
  today: Date
  selected: string | null
  onSelect: (id: string | null) => void
  onOpenWeek: (weekStart: Date) => void
  /** False when the calendar could not be read for this period. */
  available: boolean
  /** Tasks dated on a landmark's days — what we are doing about it. */
  planned: (l: Landmark) => { id: string; title: string; day: Date }[]
  /** The month's lines dated on a day, and those given a week but no day. */
  dayMarks?: (ymd: string) => CalMark[]
  weekMarks?: (weekStartYmd: string) => CalMark[]
}) {
  const weekStartsOn = readCadenceConfig().weekStartsOn
  const gridStart = useMemo(() => weekStartAnchor(start, weekStartsOn), [start, weekStartsOn])
  const weeks = useMemo(() => {
    const out: Date[] = []
    for (let w = gridStart; w < end; w = addDays(w, 7)) out.push(w)
    return out
  }, [gridStart, end])
  const todayYmd = localYmd(today)
  const thisWeek = localYmd(weekStartAnchor(today, weekStartsOn))
  const heads = Array.from({ length: 7 }, (_, k) => DOW[(weekStartsOn + k) % 7])
  const sel = landmarks.find((l) => l.id === selected) ?? null

  // Hover a day or a date to see what it is, without reading down the list
  // (Scott, 2026-10-02: the dots said something was there, not what).
  const calRef = useRef<HTMLElement>(null)
  const [peek, setPeek] = useState<Peek | null>(null)
  const anchor = (el: HTMLElement) => {
    const cal = calRef.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!cal) return { x: 0, y: 0 }
    return { x: Math.max(0, Math.min(r.left - cal.left, cal.width - PEEK_W)), y: r.bottom - cal.top + 6 }
  }
  const peekDay = (ymd: string) => (el: HTMLElement | null) => setPeek(el ? { kind: 'day', ymd, at: anchor(el) } : null)
  const peekLm = (id: string) => (el: HTMLElement | null) => setPeek(el ? { kind: 'lm', id, at: anchor(el) } : null)
  const peekCard = (() => {
    if (!peek) return null
    if (peek.kind === 'lm') {
      const l = landmarks.find((x) => x.id === peek.id)
      if (!l) return null
      const ours = planned(l)
      return { when: `${fmtDay(l.start)}${l.end > l.start ? ` – ${fmtDay(l.end)}` : ''}`, fixed: [l.title], ours: ours.map((p) => p.title) }
    }
    const day = new Date(`${peek.ymd}T12:00:00`)
    const fixed = landmarks.filter((l) => l.start <= day && l.end >= new Date(`${peek.ymd}T00:00:00`)).map((l) => l.title)
    const ours = (dayMarks?.(peek.ymd) ?? []).map((m) => m.title)
    return fixed.length || ours.length ? { when: fmtDay(day), fixed, ours } : null
  })()

  return (
    <aside ref={calRef} className="pv2-cal" aria-label="Dates we can’t move">
      <div className="pv2-colh">Dates we can’t move</div>
      <div className="pv2-dow"><span aria-hidden="true" />{heads.map((h) => <span key={h}>{h}</span>)}</div>
      {weeks.map((ws, wi) => {
        const we = addDays(ws, 6)
        const hits = landmarks.filter((l) => l.end >= ws && l.start <= we).map((l) => ({
          l, a: Math.max(0, dayIndex(l.start, ws)), b: Math.min(6, dayIndex(l.end, ws)), cont: l.start < ws,
        }))
        // Lanes: a bar takes the first lane with no overlap in this week.
        const lanes: { a: number; b: number }[][] = []
        const placed = hits.map((h) => {
          let k = 0
          while (lanes[k]?.some((o) => !(h.b < o.a || h.a > o.b))) k++
          ;(lanes[k] ??= []).push(h)
          return { ...h, lane: k }
        })
        const current = localYmd(ws) === thisWeek
        return (
          <div key={localYmd(ws)} className={`pv2-wk${current ? ' is-current' : ''}`}>
            <WeekCell ymd={localYmd(ws)} n={weekOfYear(ws, weekStartsOn)} marks={weekMarks?.(localYmd(ws)) ?? []} onOpen={() => onOpenWeek(ws)} />
            {Array.from({ length: 7 }, (_, k) => {
              const d = addDays(ws, k)
              const out = d < start || d >= end
              const marks = dayMarks?.(localYmd(d)) ?? []
              return <DayCell key={k} ymd={localYmd(d)} className={`pv2-d${out ? ' is-out' : ''}${localYmd(d) === todayYmd ? ' is-today' : ''}`} onPeek={peekDay(localYmd(d))}>
                <span>{d.getDate()}</span>
                {marks.length > 0 && <span className="pv2-pls" aria-label={marks.map((m) => m.title).join(' · ')}>{marks.slice(0, 3).map((m) => <i key={m.id} />)}</span>}
              </DayCell>
            })}
            {placed.map((h) => {
              // A one-day date is a mark in its cell — a day is ~34px, and its
              // name broke into "Colu mb…" there. The list beneath names it.
              const span = h.a !== h.b || h.l.start < h.l.end
              return (
                <button
                  key={h.l.id} type="button"
                  className={`pv2-lm${span ? ' is-span' : ' is-dot'}${h.cont && wi > 0 ? ' is-cont' : ''}${selected === h.l.id ? ' is-sel' : ''}`}
                  style={{ gridColumn: `${h.a + 2} / ${h.b + 3}`, gridRow: h.lane + 2 }}
                  aria-label={h.l.title}
                  onMouseEnter={(e) => peekLm(h.l.id)(e.currentTarget)} onMouseLeave={() => setPeek(null)}
                  onFocus={(e) => peekLm(h.l.id)(e.currentTarget)} onBlur={() => setPeek(null)}
                  onClick={() => onSelect(selected === h.l.id ? null : h.l.id)}
                >{span && !(h.cont && wi > 0) ? h.l.title : ''}</button>
              )
            })}
            {current && <button type="button" className="pv2-wkgo" onClick={() => onOpenWeek(ws)}>This week →</button>}
          </div>
        )
      })}
      {peekCard && peek && (
        <div className="pv2-peek" role="tooltip" style={{ left: peek.at.x, top: peek.at.y, width: PEEK_W }}>
          <div className="pv2-when">{peekCard.when}</div>
          {peekCard.fixed.length > 0 && <><div className="pv2-peek-k">Can’t move</div>{peekCard.fixed.map((t, i) => <div key={i} className="pv2-peek-fixed">{t}</div>)}</>}
          {peekCard.ours.length > 0 && <><div className="pv2-peek-k">On our plan</div>{peekCard.ours.map((t, i) => <div key={i} className="pv2-peek-ours">{t}</div>)}</>}
          {peek.kind === 'lm' && peekCard.ours.length === 0 && <div className="pv2-hint">Nothing planned on these days.</div>}
        </div>
      )}
      {!available && <p className="pv2-hint" style={{ marginTop: 8 }}>The calendar couldn’t be read for this period.</p>}
      {landmarks.length > 0 && (
        <ul className="pv2-lmlist" aria-label="The dates, in order">
          {[...landmarks].sort((x, y) => x.start.getTime() - y.start.getTime()).map((l) => (
            <li key={l.id}>
              <button type="button" className={selected === l.id ? 'is-sel' : ''} onClick={() => onSelect(selected === l.id ? null : l.id)}>
                <span className="pv2-lmwhen">{l.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{l.end > l.start ? `–${l.end.getMonth() === l.start.getMonth() ? l.end.getDate() : l.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
                <span className="pv2-lmname">{l.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {sel && (
        <div className="pv2-lmcard">
          <div className="pv2-when">{sel.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{sel.end > sel.start ? ` – ${sel.end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}</div>
          <div className="pv2-lmttl">{sel.title}</div>
          <div className="pv2-fact"><span className="pv2-k">Fixed</span><span>On the calendar</span></div>
          <div className="pv2-fact"><span className="pv2-k">Our plan</span>
            <span>{planned(sel).length
              ? planned(sel).map((p) => <span key={p.id} className="block">{p.title} <span className="pv2-hint">· {p.day.toLocaleDateString('en-US', { weekday: 'short' })}</span></span>)
              : <span className="pv2-hint">Nothing planned on these days.</span>}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
