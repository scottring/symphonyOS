import { memo } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { List, ListCategory } from '@/types/list'
import { MultiAssigneeDropdown } from '@/components/family'
import { SchedulePopover, DeferPicker, ContextPicker } from '@/components/triage'
import { ListPicker } from '@/components/triage/ListPicker'
import type { ScheduleContextItem } from '@/components/triage'
import { TaskCheckbox } from './TaskCheckbox'
import { DOMAIN_COLORS } from '@/lib/domainColors'

interface InboxTaskCardProps {
  task: Task
  onUpdate: (updates: Partial<Task>) => void
  onToggleWaiting?: () => void
  onSelect: () => void
  onDefer: (target: 'week' | 'month' | 'quarter') => void
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  familyMembers?: FamilyMember[]
  onAssignTaskAll?: (memberIds: string[]) => void
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // List picker props
  lists?: List[]
  listsByCategory?: Record<ListCategory, List[]>
  onSendToList?: (listId: string) => void
  onCreateList?: (title: string, category: ListCategory) => Promise<string | null>
  // Panel state (for smart close behavior)
  panelOpen?: boolean
  onClosePanel?: () => void
  // Selection mode props
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelection?: () => void
}

export const InboxTaskCard = memo(function InboxTaskCard({
  task,
  onUpdate,
  onToggleWaiting,
  onSelect,
  onDefer,
  projects = [],
  onOpenProject,
  familyMembers = [],
  onAssignTaskAll,
  getScheduleItemsForDate,
  lists = [],
  listsByCategory,
  onSendToList,
  onCreateList,
  panelOpen,
  onClosePanel,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
}: InboxTaskCardProps) {
  const project = projects.find(p => p.id === task.projectId)

  return (
    <div
      data-selectable
      onClick={() => {
        // In selection mode, clicking the card toggles selection
        if (selectionMode && onToggleSelection) {
          onToggleSelection()
          return
        }

        // Normal mode: always select this item (switches panel to show details)
        onSelect()
      }}
      className={`bg-white rounded-xl border pl-0.5 pr-3 py-2.5 shadow-sm cursor-pointer transition-all group ${
        isSelected
          ? 'bg-primary-50/40 border-primary-300 shadow-md ring-2 ring-primary-100'
          : selectionMode
            ? 'border-neutral-200 hover:bg-primary-50/20 hover:border-primary-200'
            : 'border-neutral-100 hover:shadow-md hover:border-primary-200'
      }`}
    >
      {/* Main row: checkbox | title | triage buttons */}
      <div className="flex items-center gap-0.5">
        {/* Checkbox */}
        {selectionMode ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelection?.()
            }}
            className="shrink-0 flex items-center justify-center"
          >
            <span
              className={`
                w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                ${isSelected
                  ? 'bg-primary-500/50 border-primary-500/50'
                  : 'border-primary-300 hover:border-primary-400'
                }
              `}
            />
          </button>
        ) : (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <TaskCheckbox
              completed={task.completed}
              isWaiting={task.isWaiting}
              onToggleComplete={() => {
                if (panelOpen && onClosePanel) onClosePanel()
                onUpdate({ completed: !task.completed })
              }}
              onToggleWaiting={() => {
                if (panelOpen && onClosePanel) onClosePanel()
                onToggleWaiting?.()
              }}
              contextColor={task.context ? DOMAIN_COLORS[task.context]?.dot : undefined}
            />
          </div>
        )}

        {/* Title - takes all available space, allow 2 lines */}
        <span
          className={`flex-1 min-w-0 text-sm leading-snug line-clamp-2 ${
            task.completed
              ? 'text-neutral-400 line-through'
              : task.isWaiting
                ? 'text-amber-600/70 italic'
                : 'text-neutral-800'
          }`}
        >
          {task.title}
          {task.isWaiting && !task.completed && (
            <span className="ml-1.5 text-xs text-amber-500 not-italic font-normal">waiting</span>
          )}
        </span>

        {/* Triage actions - hidden in selection mode */}
        {!selectionMode && (
          <div
            className="shrink-0 flex items-center gap-0.5"
            onClick={(e) => {
              e.stopPropagation()
              // Close panel when interacting with triage icons
              if (panelOpen && onClosePanel) {
                onClosePanel()
              }
            }}
          >
          {/* Hidden triage buttons - shown on hover (desktop only) */}
          <div className="opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-0.5">
            {/* Defer */}
            <DeferPicker
              onDefer={onDefer}
            />

            {/* Schedule */}
            <SchedulePopover
              value={task.scheduledFor}
              isAllDay={task.isAllDay}
              onSchedule={(date, isAllDay) => {
                onUpdate({ bucket: 'timed', scheduledFor: date, isAllDay })
              }}
              onClear={() => onUpdate({ bucket: 'inbox', scheduledFor: undefined, isAllDay: undefined })}
              getItemsForDate={getScheduleItemsForDate}
              itemTitle={task.title}
            />

            {/* Send to List */}
            {onSendToList && listsByCategory && (
              <ListPicker
                lists={lists}
                listsByCategory={listsByCategory}
                onSendToList={onSendToList}
                onCreateList={onCreateList}
              />
            )}

          </div>

          {/* Context picker - always visible */}
          <ContextPicker
            value={task.context}
            onChange={(context) => onUpdate({ context })}
          />

          {/* Always visible - avatars provide at-a-glance context */}
          {familyMembers.length > 0 && onAssignTaskAll && (
            <div className="hidden md:block">
              <MultiAssigneeDropdown
                members={familyMembers}
                selectedIds={task.assignedToAll || []}
                onSelect={onAssignTaskAll}
                size="sm"
              />
            </div>
          )}
        </div>
        )}
      </div>

      {/* Chips row - desktop only, only show if project exists */}
      {project && (
        <div className="hidden md:flex items-center gap-2 mt-1.5 ml-8 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs max-w-[140px]">
            <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            {onOpenProject ? (
              <button
                onClick={() => onOpenProject(project.id)}
                className="truncate hover:underline"
              >
                {project.name}
              </button>
            ) : (
              <span className="truncate">{project.name}</span>
            )}
            <button
              onClick={() => onUpdate({ projectId: undefined })}
              className="ml-0.5 hover:text-blue-900 shrink-0"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </span>
        </div>
      )}
    </div>
  )
})
