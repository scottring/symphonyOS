import { SchedulePopover } from '@/components/triage/SchedulePopover'
import { PanelMoreMenu } from './PanelMoreMenu'
import { ConceptIcon } from '@/lib/conceptIcons'

interface PanelActionsProps {
  completed: boolean
  phoneNumber?: string
  scheduledFor?: Date
  isAllDay?: boolean
  isPinned: boolean
  onToggleComplete: () => void
  onSchedule: (date: Date, isAllDay: boolean) => void
  onClearSchedule?: () => void
  onTogglePin: () => void
  onDelete: () => void
}

export function PanelActions({
  completed,
  phoneNumber,
  scheduledFor,
  isAllDay,
  isPinned,
  onToggleComplete,
  onSchedule,
  onClearSchedule,
  onTogglePin,
  onDelete,
}: PanelActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
      <button
        onClick={onToggleComplete}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        {completed ? '↺ Reopen' : <><ConceptIcon name="done" decorative /> Done</>}
      </button>
      {phoneNumber && (
        <a
          href={`tel:${phoneNumber}`}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          <ConceptIcon name="call" decorative /> {phoneNumber}
        </a>
      )}
      <SchedulePopover
        value={scheduledFor}
        isAllDay={isAllDay}
        onSchedule={onSchedule}
        onClear={onClearSchedule}
        trigger={
          <button className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors">
            <ConceptIcon name="when" decorative /> Schedule
          </button>
        }
      />
      <PanelMoreMenu isPinned={isPinned} onTogglePin={onTogglePin} onDelete={onDelete} />
    </div>
  )
}
