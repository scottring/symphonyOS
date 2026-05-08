import type { ImminentEntity } from './useImminentEntity'

interface WallNowFocusCardProps {
  imminent: ImminentEntity | null
  now: Date
}

function minutesUntil(target: Date, now: Date): number {
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000))
}

export function WallNowFocusCard({ imminent, now }: WallNowFocusCardProps) {
  if (!imminent) {
    return (
      <div className="rounded-2xl bg-neutral-900/60 p-8 text-center">
        <p className="text-neutral-400 text-base">Nothing right now.</p>
        <p className="text-neutral-600 text-sm mt-2">Take a breath.</p>
      </div>
    )
  }

  const minutes = minutesUntil(imminent.startTime, now)
  const isEvent = imminent.kind === 'event'
  const title = (imminent.entity as { title: string }).title
  const location = isEvent
    ? (imminent.entity as { location?: string }).location
    : undefined

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 p-8 text-white">
      <div className="text-sm uppercase tracking-wider text-white/60 mb-2">In {minutes} min</div>
      <div className="font-display text-3xl font-semibold leading-tight">{title}</div>
      {location && (
        <div className="mt-3 text-base text-white/80">📍 {location}</div>
      )}
    </div>
  )
}
