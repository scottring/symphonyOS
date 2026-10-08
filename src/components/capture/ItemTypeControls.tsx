import { CalendarClock, CheckSquare, ChevronDown, Circle, RefreshCw, Target } from 'lucide-react'
import type { PlanDay } from '@/lib/planParse'
import { PAPER_ITEM_TYPES, type PaperItemType } from '@/lib/paperItemType'

// The same colours and icons TaskKindBadge draws, so the selector reads as
// the badge it replaced — only now it is a control.
const META: Record<PaperItemType, { Icon: typeof Circle; className: string }> = {
  goal: { Icon: Target, className: 'border-amber-200 bg-amber-50 text-amber-800' },
  task: { Icon: Circle, className: 'border-neutral-200 bg-white text-neutral-600' },
  appointment: { Icon: CalendarClock, className: 'border-blue-200 bg-blue-50 text-blue-700' },
  activity: { Icon: CheckSquare, className: 'border-sage-200 bg-sage-50 text-sage-600' },
  routine: { Icon: RefreshCw, className: 'border-primary-200 bg-primary-50 text-primary-700' },
}

/** A row's one "What is this?" answer, as a native select: keyboard, screen
 *  reader and the phone's own picker all come with it. `options` narrows the
 *  answers (a list page's kinds); `quiet` draws it as a secondary control. */
export function ItemTypeSelect({ value, title, onChange, options = PAPER_ITEM_TYPES, ariaLabel, quiet = false }: {
  value: PaperItemType
  title: string
  onChange: (type: PaperItemType) => void
  options?: readonly { id: PaperItemType; label: string }[]
  ariaLabel?: string
  quiet?: boolean
}) {
  const { Icon, className } = META[value]
  return (
    <span className={`relative inline-flex shrink-0 items-center rounded-md border ${quiet ? 'border-neutral-200 bg-white text-neutral-500' : className}`}>
      <Icon className="pointer-events-none absolute left-1.5 h-3 w-3" aria-hidden="true" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PaperItemType)}
        aria-label={ariaLabel ?? `What is "${title}"?`}
        className={`appearance-none bg-transparent py-1 pl-[1.9em] pr-[1.7em] ${quiet ? 'text-[12px] font-medium' : 'text-[11px] font-semibold'} leading-none text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded-md cursor-pointer`}
      >
        {options.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1 h-3 w-3" aria-hidden="true" />
    </span>
  )
}

const DAYS: { id: PlanDay; short: string; long: string }[] = [
  { id: 'sun', short: 'S', long: 'Sunday' },
  { id: 'mon', short: 'M', long: 'Monday' },
  { id: 'tue', short: 'T', long: 'Tuesday' },
  { id: 'wed', short: 'W', long: 'Wednesday' },
  { id: 'thu', short: 'T', long: 'Thursday' },
  { id: 'fri', short: 'F', long: 'Friday' },
  { id: 'sat', short: 'S', long: 'Saturday' },
]

/** The days a routine repeats — required, so a routine is never saved on a
 *  day nobody chose. */
export function RoutineDaysPicker({ title, days, invalid, onChange }: {
  title: string
  days: PlanDay[]
  invalid: boolean
  onChange: (days: PlanDay[]) => void
}) {
  const on = new Set(days)
  const toggle = (d: PlanDay) =>
    onChange(DAYS.map((x) => x.id).filter((x) => (x === d ? !on.has(d) : on.has(x))))
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] text-neutral-500">Repeats</span>
      <div role="group" aria-label={`Days "${title}" repeats`} className="flex flex-wrap gap-1">
        {DAYS.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={on.has(d.id)}
            aria-label={d.long}
            onClick={() => toggle(d.id)}
            className={`h-7 w-7 rounded-full border text-[12px] font-semibold transition-colors ${
              on.has(d.id)
                ? 'border-primary-300 bg-primary-600 text-white'
                : invalid ? 'border-danger-500 bg-white text-neutral-600' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {d.short}
          </button>
        ))}
      </div>
      {invalid && <span className="text-[12px] font-medium text-danger-600">Pick at least one day</span>}
    </div>
  )
}
