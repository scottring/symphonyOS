import { useMemo } from 'react'
import type { Task } from '@/types/task'
import { ScratchpadPane } from '@/components/schedule/ScratchpadPane'
import { AtAGlance } from './AtAGlance'

interface TodayRailProps {
  /** All tasks from entities. Used to count open work for today. */
  tasks: Task[]
  /** CTA for AT A GLANCE → opens fuller plan view (week, day detail). */
  onViewFullPlan: () => void
}

/**
 * Right-rail container for the Today view. Hosts ambient panels (At a Glance,
 * Family Snapshot, Active Projects) above the Scratchpad action surface.
 *
 * Built incrementally: each panel ships independently. Earlier panels accept
 * only the data they need; later panels add their own props.
 */
export function TodayRail({ tasks, onViewFullPlan }: TodayRailProps) {
  const openTaskCount = useMemo(() => {
    // "Still open" = scheduled, not completed, not in inbox.
    // Inbox is a separate signal; conflating it would inflate the count.
    return tasks.filter((t) => !t.completed && t.bucket !== 'inbox').length
  }, [tasks])

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      <AtAGlance
        openTaskCount={openTaskCount}
        eventsTodayCount={0}
        tomorrowFirstEvent={null}
        onViewFullPlan={onViewFullPlan}
      />

      <div className="flex-1 min-h-0">
        <ScratchpadPane />
      </div>
    </div>
  )
}
