// The week, seven tiles across, inside a deck card's "This week" reveal: tap
// a day to give the card that day. Each tile shows what's already there (at
// most three lines) so the choice is made with the week in view.

export interface StripDay {
  key: string
  date: Date
  label: string
  isWeekend: boolean
  lines: string[]
  more: number
}

const SHOWN = 3

export function WeekStrip({ days, onPick, onNoDay, disabled }: {
  days: StripDay[]
  onPick: (d: Date) => void
  onNoDay: () => void
  disabled?: boolean
}) {
  return (
    <>
      <div className="deck-strip">
        {days.map((d) => {
          const shown = d.lines.slice(0, SHOWN)
          const more = d.more + Math.max(0, d.lines.length - SHOWN)
          return (
            <button
              key={d.key}
              type="button"
              className={`deck-day${shown.length ? '' : ' is-empty'}`}
              onClick={() => onPick(d.date)}
              disabled={disabled}
            >
              <b className={d.isWeekend ? 'is-weekend' : undefined}>{d.label}</b>
              {shown.length ? shown.map((line, i) => <span key={i}>{line}</span>) : <span>Nothing yet</span>}
              {more > 0 && <i>+{more} more</i>}
            </button>
          )
        })}
      </div>
      <div className="deck-noday">
        <button type="button" className="deck-when is-quiet" onClick={onNoDay} disabled={disabled}>This week, no day yet</button>
      </div>
    </>
  )
}
