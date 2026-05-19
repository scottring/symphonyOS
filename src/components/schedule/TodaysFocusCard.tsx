import { Leaf } from 'lucide-react'

interface TodaysFocusCardProps {
  headline: string
  priorities: number
  meals: number
  events: number
  onActivate?: () => void
}

function segment(n: number, singular: string, plural: string): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? singular : plural}`
}

const innerContent = (headline: string, subline: string) => (
  <>
    <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary-50 text-primary-600" aria-hidden="true">
      <Leaf className="w-4 h-4" />
    </span>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">
        TODAY'S FOCUS
      </p>
      <p className="font-display text-lg text-neutral-800 leading-snug">{headline}</p>
      <p className="mt-0.5 text-[13px] text-neutral-500">{subline}</p>
    </div>
  </>
)

export function TodaysFocusCard({ headline, priorities, meals, events, onActivate }: TodaysFocusCardProps) {
  const parts = [
    segment(priorities, 'priority', 'priorities'),
    segment(meals, 'meal', 'meals'),
    segment(events, 'event', 'events'),
  ].filter(Boolean) as string[]
  const subline = parts.length > 0 ? parts.join(' • ') : 'Nothing scheduled yet'

  if (onActivate) {
    return (
      <button
        type="button"
        aria-label="Today's Focus"
        onClick={onActivate}
        className="card flex items-start gap-3 px-5 py-4 w-full text-left bg-[hsl(145_24%_95%)] border border-[hsl(145_20%_88%)]"
      >
        {innerContent(headline, subline)}
      </button>
    )
  }

  return (
    <div className="card flex items-start gap-3 px-5 py-4 bg-[hsl(145_24%_95%)] border border-[hsl(145_20%_88%)]">
      {innerContent(headline, subline)}
    </div>
  )
}
