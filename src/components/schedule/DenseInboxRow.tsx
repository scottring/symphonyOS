import { memo, useState, useCallback } from 'react'
import { Trash2, Check, Tag, Star } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import type { Task, TaskContext } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { MultiAssigneeDropdown } from '@/components/family'
import { TaskCheckbox } from './TaskCheckbox'
import { DOMAIN_COLORS } from '@/lib/domainColors'
import { ProjectControl } from '@/components/project/ProjectControl'

export type QuickAction =
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'someday' }
  | { kind: 'next-week' }
  | { kind: 'note' }
  | { kind: 'delete' }

const ACTION_LABELS: Record<QuickAction['kind'], string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  someday: 'Someday',
  'next-week': 'Next Week',
  note: 'Note',
  delete: 'Delete',
}

interface DenseInboxRowProps {
  task: Task
  project?: Project
  projects?: Project[]
  familyMembers: FamilyMember[]
  quickActions: QuickAction[]
  onQuickAction: (action: QuickAction) => void
  onToggleComplete: () => void
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void
  onOpenProject?: (projectId: string) => void
  onAssign?: (memberIds: string[]) => void
  /** Called when the user creates a new project from the inline form.
   *  Should create the project and assign it to this task. */
  onCreateProject?: (name: string, context: TaskContext | null) => void
  isLeaving?: boolean
  /** When false, hide the project chip (used inside project-grouped surfaces
   *  where the project name lives in the group header). Default: true. */
  showProjectChip?: boolean
  /** When true, hide context dot + quick actions until the row is hovered or
   *  contains focus. Reduces visual noise in long lists. Default: false. */
  hoverOnlyChrome?: boolean
  /** Bulk-select mode: the leading control toggles selection instead of completion. */
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelection?: () => void
  /** When provided, replaces the flat `quickActions` chips with a richer control
   *  (e.g. the fan-out TriageWhenMenu). The wrapper's hover-chrome behaviour is
   *  preserved. */
  triageMenu?: React.ReactNode
  /** When provided, shows a persistent star toggle (the "Focus" affordance used
   *  by the This Week dropdown). Filled amber when active. */
  focusToggle?: { active: boolean; onToggle: () => void }
}

const CONTEXT_OPTIONS: Array<{ value: TaskContext | null; label: string }> = [
  { value: 'work', label: 'Work' },
  { value: 'family', label: 'Family' },
  { value: 'personal', label: 'Personal' },
  { value: null, label: 'Clear' },
]

export const DenseInboxRow = memo(function DenseInboxRow({
  showProjectChip = true,
  hoverOnlyChrome = false,
  task,
  project,
  projects,
  familyMembers,
  quickActions,
  onQuickAction,
  onToggleComplete,
  onUpdate,
  onSelect,
  onOpenProject,
  onAssign,
  onCreateProject,
  isLeaving,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  triageMenu,
  focusToggle,
}: DenseInboxRowProps) {
  const [contextOpen, setContextOpen] = useState(false)

  const contextColor = task.context ? DOMAIN_COLORS[task.context]?.dot : undefined

  const handleToggleWaiting = useCallback(() => {
    onUpdate({ isWaiting: !task.isWaiting })
  }, [onUpdate, task.isWaiting])

  return (
    <div
      data-row
      data-task-id={task.id}
      className={`
        group flex items-start gap-2 rounded-xl border
        px-3 py-2 shadow-sm transition-all duration-200
        ${isSelected ? 'bg-primary-50/50 border-primary-300' : 'bg-white border-neutral-100'}
        ${isLeaving ? 'opacity-0 translate-x-2 max-h-0 py-0 my-0 overflow-hidden border-transparent' : 'hover:shadow-md'}
      `}
    >
      {/* Leading control: selection checkbox in bulk mode, else completion. */}
      <div className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
        {selectionMode ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Select ${task.title}`}
            onClick={onToggleSelection}
            className={`w-4 h-4 rounded-[4px] border-2 grid place-items-center transition-colors ${
              isSelected ? 'bg-primary-500 border-primary-500 text-white' : 'border-neutral-300 text-transparent hover:border-primary-400'
            }`}
          >
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
          </button>
        ) : (
          <TaskCheckbox
            completed={task.completed}
            isWaiting={task.isWaiting}
            onToggleComplete={onToggleComplete}
            onToggleWaiting={handleToggleWaiting}
            contextColor={contextColor}
          />
        )}
      </div>

      {/* Focus star (This Week dropdown): persistent, filled amber when active. */}
      {focusToggle && (
        <button
          type="button"
          aria-label={focusToggle.active ? `Remove ${task.title} from Focus` : `Add ${task.title} to Focus`}
          aria-pressed={focusToggle.active}
          title={focusToggle.active ? 'In Focus' : 'Add to Focus'}
          onClick={(e) => { e.stopPropagation(); focusToggle.onToggle() }}
          className={`shrink-0 mt-0.5 p-0.5 rounded transition-colors ${
            focusToggle.active ? 'text-amber-500' : 'text-neutral-300 hover:text-amber-400'
          }`}
        >
          <Star className="w-4 h-4" fill={focusToggle.active ? 'currentColor' : 'none'} />
        </button>
      )}

      {/* Title */}
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 min-w-[6rem] text-left text-sm leading-snug break-words py-0.5 ${
          task.completed
            ? 'text-neutral-400 line-through'
            : task.isWaiting
              ? 'text-amber-600/70 italic'
              : 'text-neutral-800'
        }`}
      >
        {task.title}
      </button>

      {/* Project chip (assigned) or picker (unassigned). Hidden inside
          project-grouped surfaces where the group header already names the
          project. */}
      {showProjectChip && (
        <ProjectControl
          project={project}
          projects={projects}
          onOpenProject={onOpenProject}
          onAssign={(projectId) => onUpdate({ projectId })}
          onClear={() => onUpdate({ projectId: undefined })}
          onCreate={onCreateProject}
          defaultNewName={task.title}
        />
      )}


      {/* Context dot — moved to the trailing controls so it sits with the rest
          of the triage affordances (assignee, when, delete) instead of crowding
          the title. Popover opens right-aligned to stay on-screen. */}
      <div
        className={`relative shrink-0 mt-0.5 ${
          hoverOnlyChrome ? 'hidden group-hover:block group-focus-within:block' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Context"
          title="Context"
          onClick={() => setContextOpen((v) => !v)}
          className="p-1 rounded-md hover:bg-neutral-100 transition-colors"
        >
          <Tag
            className="w-3.5 h-3.5"
            style={{ color: contextColor ?? 'var(--color-neutral-400, #a3a3a3)' }}
            fill={contextColor ? contextColor : 'none'}
          />
        </button>
        {contextOpen && (
          <div className="absolute z-40 top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[120px]">
            {CONTEXT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50"
                onClick={() => {
                  onUpdate({ context: opt.value })
                  setContextOpen(false)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assignee avatar */}
      {familyMembers.length > 0 && onAssign && (
        <div className="hidden md:block shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <MultiAssigneeDropdown
            members={familyMembers}
            selectedIds={task.assignedToAll ?? []}
            onSelect={onAssign}
            size="sm"
          />
        </div>
      )}

      {/* Quick action buttons. In hover-chrome mode, hidden until row is
          hovered/focused so the default view stays calm. */}
      <div
        className={`items-center gap-1 shrink-0 mt-0.5 ${
          hoverOnlyChrome ? 'hidden group-hover:flex group-focus-within:flex' : 'flex'
        }`}
      >
        {triageMenu ?? quickActions.map((action) => {
          const label = ACTION_LABELS[action.kind]
          if (action.kind === 'note') {
            return (
              <button
                key="note"
                type="button"
                aria-label="Send to note"
                onClick={() => onQuickAction(action)}
                className="text-xs px-2.5 py-1 rounded-md font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <ConceptIcon name="note" decorative /> Note
              </button>
            )
          }
          if (action.kind === 'delete') {
            return (
              <button
                key="delete"
                type="button"
                aria-label="Delete"
                onClick={() => onQuickAction(action)}
                className="p-1.5 rounded-md text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          }
          const isPrimary = action.kind === 'today'
          return (
            <button
              key={action.kind}
              type="button"
              aria-label={label}
              onClick={() => onQuickAction(action)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                isPrimary
                  ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
})
