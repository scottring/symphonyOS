import { formatDateMonthDay } from '@/lib/weekHelpers'

interface Props {
  weekStart: Date
}

export function PlannerHeader({ weekStart }: Props) {
  const weekLabel = `WEEK OF ${formatDateMonthDay(weekStart).toUpperCase()}`
  return (
    <div className="mb-8">
      <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">
        {weekLabel}
      </div>
      <h1 className="font-display text-[3.25rem] leading-[1.05] text-neutral-800">
        Plan the <span className="italic text-primary-500">week.</span>
      </h1>
      <p className="font-display italic text-[1.25rem] text-neutral-500 mt-3">
        One stanza per day. Tap to add, tap to edit.
      </p>
    </div>
  )
}
