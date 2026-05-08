import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { useImminentEntity } from './useImminentEntity'
import { WallNowFocusCard } from './WallNowFocusCard'
import { WallNowRail } from './WallNowRail'

interface WallNowViewProps {
  events: CalendarEvent[]
  tasks: Task[]
  dinner: string | null
  openListCount: number
  discussionCount: number
  now: Date
}

export function WallNowView({
  events,
  tasks,
  dinner,
  openListCount,
  discussionCount,
  now,
}: WallNowViewProps) {
  const imminent = useImminentEntity({
    events,
    tasks,
    now,
    windowMinutes: 30,
  })

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="flex flex-col gap-6 p-8 min-h-full bg-neutral-950 text-white">
      <header className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl">{dateStr}</h2>
        <span className="text-base text-neutral-400">{timeStr}</span>
      </header>

      <WallNowFocusCard imminent={imminent} now={now} />

      <WallNowRail
        dinner={dinner}
        openListCount={openListCount}
        discussionCount={discussionCount}
      />
    </div>
  )
}
