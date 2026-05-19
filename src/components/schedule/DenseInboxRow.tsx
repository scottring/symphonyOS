import { memo, useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
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
}

const CONTEXT_OPTIONS: Array<{ value: TaskContext | null; label: string }> = [
  { value: 'work', label: 'Work' },
  { value: 'family', label: 'Family' },
  { value: 'personal', label: 'Personal' },
  { value: null, label: 'Clear' },
]

export const DenseInboxRow = memo(function DenseInboxRow({
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
        group flex items-start gap-2 bg-white rounded-xl border border-neutral-100
        px-3 py-2 shadow-sm transition-all duration-200
        ${isLeaving ? 'opacity-0 translate-x-2 max-h-0 py-0 my-0 overflow-hidden border-transparent' : 'hover:shadow-md'}
      `}
    >
      {/* Checkbox */}
      <div className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <TaskCheckbox
          completed={task.completed}
          isWaiting={task.isWaiting}
          onToggleComplete={onToggleComplete}
          onToggleWaiting={handleToggleWaiting}
          contextColor={contextColor}
        />
      </div>

      {/* Context dot button */}
      <div className="relative shrink-0 mt-1.5">
        <button
          type="button"
          aria-label="Context"
          onClick={() => setContextOpen((v) => !v)}
          className="w-3 h-3 rounded-full border border-neutral-200 hover:scale-110 transition-transform"
          style={{ background: contextColor ?? 'transparent' }}
        />
        {contextOpen && (
          <div className="absolute z-30 top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[120px]">
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

      {/* Title */}
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 min-w-0 text-left text-sm leading-snug break-words py-0.5 ${
          task.completed
            ? 'text-neutral-400 line-through'
            : task.isWaiting
              ? 'text-amber-600/70 italic'
              : 'text-neutral-800'
        }`}
      >
        {task.title}
      </button>

      {/* Project chip (assigned) or picker (unassigned) */}
      <ProjectControl
        project={project}
        projects={projects}
        onOpenProject={onOpenProject}
        onAssign={(projectId) => onUpdate({ projectId })}
        onClear={() => onUpdate({ projectId: undefined })}
        onCreate={onCreateProject}
        defaultNewName={task.title}
      />


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

      {/* Quick action buttons */}
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        {quickActions.map((action) => {
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
