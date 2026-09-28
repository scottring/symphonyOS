// src/components/plan/v2/DatesCalendar.tsx
//
// "Dates we can't move": the period's shape, not its whole calendar. Closures,
// deadlines and stretches (all-day and multi-day entries) drawn as marks and
// bars across the days, the way a paper month shows a line over a call week.

import { useMemo } from 'react'
import type { Landmark } from '@/lib/planning/v2/planV2'
import { readCadenceConfig, weekStartAnchor, localYmd } from '@/lib/cadence/config'

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dayIndex = (d: Date, weekStart: Date) => Math.round((d.getTime() - weekStart.getTime()) / 86400000)

export function DatesCalendar({ start, end, landmarks, today, selected, onSelect, onOpenWeek, available, planned }: {
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

  return (
    <aside className="pv2-cal" aria-label="Dates we can’t move">
      <div className="pv2-colh">Dates we can’t move</div>
      <div className="pv2-dow">{heads.map((h) => <span key={h}>{h}</span>)}</div>
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
            {Array.from({ length: 7 }, (_, k) => {
              const d = addDays(ws, k)
              const out = d < start || d >= end
              return <div key={k} className={`pv2-d${out ? ' is-out' : ''}${localYmd(d) === todayYmd ? ' is-today' : ''}`}><span>{d.getDate()}</span></div>
            })}
            {placed.map((h) => (
              <button
                key={h.l.id} type="button"
                className={`pv2-lm${h.a !== h.b || h.l.start < h.l.end ? ' is-span' : ''}${h.cont && wi > 0 ? ' is-cont' : ''}${selected === h.l.id ? ' is-sel' : ''}`}
                style={{ gridColumn: `${h.a + 1} / ${h.b + 2}`, gridRow: h.lane + 2 }}
                title={h.l.title}
                onClick={() => onSelect(selected === h.l.id ? null : h.l.id)}
              >{h.cont && wi > 0 ? '' : h.l.title}</button>
            ))}
            {current && <button type="button" className="pv2-wkgo" onClick={() => onOpenWeek(ws)}>This week →</button>}
          </div>
        )
      })}
      {!available && <p className="pv2-hint" style={{ marginTop: 8 }}>The calendar couldn’t be read for this period.</p>}
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
