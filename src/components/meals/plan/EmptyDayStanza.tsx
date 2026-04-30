import { dayLabelFor } from '@/lib/weekHelpers'

interface Props {
  dayOfWeek: number
  date: Date
  isToday: boolean
  onPickRecipe: () => void
}

export function EmptyDayStanza({ dayOfWeek, date, isToday, onPickRecipe }: Props) {
  return (
    <button onClick={onPickRecipe}
            className={`block w-full text-left rounded-2xl px-6 py-5 mb-3 border-2 border-dashed transition-colors ${
              isToday
                ? 'border-primary-300 bg-primary-50/30 hover:bg-primary-50/60'
                : 'border-neutral-300 hover:bg-neutral-100'
            }`}>
      <div className={`text-[0.7rem] font-bold uppercase tracking-[0.22em] mb-1 ${isToday ? 'text-primary-600' : 'text-neutral-400'}`}>
        {dayLabelFor(dayOfWeek)} · {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{isToday && ' · TODAY'}
      </div>
      <p className="font-display italic text-[1.5rem] text-neutral-400">
        What for {dayLabelFor(dayOfWeek)[0] + dayLabelFor(dayOfWeek).slice(1).toLowerCase()}? <span className="text-[1rem] tracking-wide">tap for ideas →</span>
      </p>
    </button>
  )
}
