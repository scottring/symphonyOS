// Season's ideal week, read-only: the 168-hour bar (base / goals / free), its
// legend, and the blocks. The editor (IdealWeekEditor) reuses the bar and the
// "left" line. Over 168h the bar fills and the left line turns to the danger token.

import { baseHours, formatHours, goalHours, hoursLeft, totalHours, WEEK_HOURS, type IdealWeek } from '@/lib/guide/idealWeek'
import './guide.css'

export type IdealWeekGoal = { id: string; title: string }

export function IdealWeekLeft({ value }: { value: IdealWeek }) {
  const left = hoursLeft(value)
  return (
    <p className="guide-iw-left" data-over={left < 0 || undefined}>
      <b>{formatHours(left)}</b> of {WEEK_HOURS}h left
    </p>
  )
}

export function IdealWeekBar({ value }: { value: IdealWeek }) {
  const left = hoursLeft(value)
  const span = Math.max(WEEK_HOURS, totalHours(value))
  const pct = (h: number) => `${(h / span) * 100}%`
  const label = `${WEEK_HOURS} hours: ${formatHours(baseHours(value))} committed, ${formatHours(goalHours(value))} for goals, ${left < 0 ? `${formatHours(-left)} over` : `${formatHours(left)} free`}`
  const shown = value.blocks.filter(b => b.hours > 0)
  let baseIndex = 0
  return (
    <>
      <div className="guide-iw-bar" role="img" aria-label={label}>
        {shown.map(b => (
          <span key={b.id} className={b.goalId ? 'guide-iw-goal' : `guide-iw-base guide-iw-base-${baseIndex++ % 4}`} style={{ width: pct(b.hours) }} />
        ))}
        {left > 0 && <span className="guide-iw-free" style={{ width: pct(left) }} />}
      </div>
      <ul className="guide-iw-legend" aria-hidden="true">
        {(() => {
          let i = 0
          return shown.map(b => (
            <li key={b.id}><i className={b.goalId ? 'guide-iw-goal' : `guide-iw-base guide-iw-base-${i++ % 4}`} />{b.label} {formatHours(b.hours)}</li>
          ))
        })()}
        {left > 0 && <li><i className="guide-iw-free" />Free {formatHours(left)}</li>}
      </ul>
    </>
  )
}

/** `headless`: inside the Season page's own section (PageSection), which
 *  names it: the hours left, the bar and the blocks. */
export function IdealWeekSection({ value, goals, headless }: { value: IdealWeek; goals: IdealWeekGoal[]; headless?: boolean }) {
  if (value.blocks.length === 0) return null
  const title = (id?: string) => (id ? goals.find(g => g.id === id)?.title : undefined)
  const Tag = headless ? 'div' : 'section'
  return (
    <Tag className={`guide-iw${headless ? ' is-headless' : ''}`} aria-label={headless ? undefined : 'Ideal week'}>
      {headless ? <IdealWeekLeft value={value} />
        : <div className="guide-iw-top"><h3 className="guide-iw-title">Ideal week</h3><IdealWeekLeft value={value} /></div>}
      <IdealWeekBar value={value} />
      <ul className="guide-iw-rows" aria-label="Blocks">
        {value.blocks.map(b => (
          <li key={b.id} data-goal={b.goalId ? '' : undefined}>
            <span>
              {b.label}
              {(b.when || title(b.goalId)) && <span className="guide-iw-sub"> · {[title(b.goalId), b.when].filter(Boolean).join(' · ')}</span>}
            </span>
            <span>{formatHours(b.hours)}</span>
          </li>
        ))}
      </ul>
    </Tag>
  )
}
