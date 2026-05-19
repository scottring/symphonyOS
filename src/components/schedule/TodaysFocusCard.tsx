import { Leaf } from 'lucide-react'

interface TodaysFocusCardProps {
  headline: string
  priorities: number
  meals: number
  events: number
}

function segment(n: number, singular: string, plural: string): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? singular : plural}`
}

export function TodaysFocusCard({ headline, priorities, meals, events }: TodaysFocusCardProps) {
  const parts = [
    segment(priorities, 'priority', 'priorities'),
    segment(meals, 'meal', 'meals'),
    segment(events, 'event', 'events'),
  ].filter(Boolean) as string[]
  const subline = parts.length > 0 ? parts.join(' • ') : 'Nothing scheduled yet'

  return (
    <div className="card flex items-start gap-3 px-5 py-4">
      <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary-50 text-primary-600" aria-hidden="true">
        <Leaf className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Today's Focus
        </p>
        <p className="font-display text-lg text-neutral-800 leading-snug">{headline}</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">{subline}</p>
      </div>
    </div>
  )
}
