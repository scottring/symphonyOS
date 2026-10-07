import { memo, useState, useCallback, createElement } from 'react'
import { Trash2, Check, Tag, Star, GripVertical, Hourglass } from 'lucide-react'
import { useLongPress } from '@/hooks/useLongPress'
import { taskIconFor } from '@/lib/taskIcon'
import { cardNotePreview } from '@/lib/cardNotePreview'
import { ConceptIcon } from '@/lib/conceptIcons'
import type { Task, TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { MultiAssigneeDropdown } from '@/components/family'
import { TaskCheckbox } from './TaskCheckbox'
import { DOMAIN_COLORS } from '@/lib/domainColors'

export type QuickAction =
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'someday' }
  | { kind: 'next-week' }
  | { kind: 'note' }
  | { kind: 'complete' }
  | { kind: 'delete' }

const ACTION_LABELS: Record<QuickAction['kind'], string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  someday: 'Someday',
  'next-week': 'Next Week',
  note: 'Note',
  complete: 'Done',
  delete: 'Delete',
}

// The project chip/picker used to live between the title and the context dot.
// Projects are hidden from the product (2026-09-02 — see the note in
// Sidebar.tsx), so the triage row no longer files anything into one.
interface DenseInboxRowProps {
  task: Task
  familyMembers: FamilyMember[]
  quickActions: QuickAction[]
  onQuickAction: (action: QuickAction) => void
  onToggleComplete: () => void
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void
  onAssign?: (memberIds: string[]) => void
  isLeaving?: boolean
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
  /** Cascade ancestry ("← Ship auth layer ← Firebase rebuild") — one quiet
   *  line under the title, showing WHY this item exists. Computed by the
   *  horizon surfaces via lineageLabel(); absent = no thread recorded. */
  lineage?: string | null
  /** When provided, shows a persistent star toggle (the "Focus" affordance used
   *  by the This Week dropdown). Filled amber when active. */
  focusToggle?: { active: boolean; onToggle: () => void }
  /** Shows the grip handle and makes the row draggable (sets `text/task-id`
   *  on dragStart). Default false — most surfaces rendering this row
   *  (InboxView, StagingFloat, MemberView) have no drop target to drag onto;
   *  only the horizons pool renderer (a grid with day/rail drop targets)
   *  opts in. */
  draggable?: boolean
  /** 'readonly': show the life area as a small dot (only when set) instead of
   *  the tag picker — the Inbox edits it from its More menu. Default 'picker'. */
  contextControl?: 'picker' | 'readonly'
  /** 'card' (the Inbox, design B 2026-10-07): a white card — the icon tile
   *  that is also the check, a serif title, a note preview, where it came
   *  from, and its triage actions under the title. Default 'row'. */
  look?: 'row' | 'card'
}

const CONTEXT_OPTIONS: Array<{ value: TaskContext | null; label: string }> = [
  { value: 'work', label: 'Work' },
  { value: 'family', label: 'Family' },
  { value: 'personal', label: 'Personal' },
  { value: null, label: 'No area' },
]

export const DenseInboxRow = memo(function DenseInboxRow({
  hoverOnlyChrome = false,
  task,
  familyMembers,
  quickActions,
  onQuickAction,
  onToggleComplete,
  onUpdate,
  onSelect,
  onAssign,
  isLeaving,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  triageMenu,
  focusToggle,
  lineage,
  draggable = false,
  contextControl = 'picker',
  look = 'row',
}: DenseInboxRowProps) {
  const [contextOpen, setContextOpen] = useState(false)

  const contextColor = task.context ? DOMAIN_COLORS[task.context]?.dot : undefined

  const handleToggleWaiting = useCallback(() => {
    onUpdate({ isWaiting: !task.isWaiting })
  }, [onUpdate, task.isWaiting])

  if (look === 'card') {
    return (
      <InboxCard
        task={task}
        familyMembers={familyMembers}
        contextColor={contextColor}
        isLeaving={isLeaving}
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggleSelection={onToggleSelection}
        onToggleComplete={onToggleComplete}
        onToggleWaiting={handleToggleWaiting}
        onSelect={onSelect}
        onAssign={onAssign}
        lineage={lineage}
        actions={triageMenu}
      />
    )
  }

  return (
    <div
      data-row
      data-task-id={task.id}
      // The library row (layout system, 2026-10-01): no card, no rule between
      // rows — the hover tint marks the one under your hand. The leading
      // controls stand in the margin lane (40px phone / 64px desktop) so the
      // title starts at the page's body edge. It stays a wrapping flex row,
      // not LIST_ROW's grid: when the row is narrower than title + triage
      // controls, the controls wrap under the title as one unit. The box
      // bleeds 12px past the column (-mx-3 px-3) so its content sits on it.
      className={`
        group -mx-3 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border
        px-3 py-2.5 transition-colors duration-200
        ${isSelected ? 'bg-primary-50/50 border-primary-100' : 'border-transparent'}
        ${isLeaving ? 'opacity-0 translate-x-2 max-h-0 py-0 my-0 overflow-hidden border-transparent' : 'hover:bg-primary-50/50 hover:border-primary-100'}
      `}
    >
      {/* The margin lane: grip, the leading check and the focus star, set
          against the body edge. Grows rather than overflows if all three show. */}
      <div className="flex min-w-10 shrink-0 items-start justify-end gap-1 md:min-w-16">
      {/* Grip handle — the ONLY draggable surface on the row. Drag must not
          hijack clicks on the checkbox/title/popovers/quick actions, so the
          draggable + dragStart attributes live here, not on the row div.
          Gated behind `draggable` — surfaces with no drop target (inbox,
          staging, member view) must not show a grip that goes nowhere. */}
      {draggable && task.id && (
        <span
          data-testid="drag-handle"
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
          className="shrink-0 mt-1 cursor-grab"
          aria-hidden
        >
          <GripVertical className="w-3 h-3 text-neutral-300" />
        </span>
      )}

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
      </div>

      {/* Title. The floor is what a title needs to read as one line; when
          the row is narrower than title + triage controls (a detail panel
          open beside the inbox), the controls wrap under the title instead
          of squeezing it to a 90px column (demo walkthrough 2026-09-04). */}
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 min-w-[11rem] md:min-w-[16rem] text-left text-[16px] leading-snug break-words py-0.5 ${
          task.completed
            ? 'text-neutral-400 line-through'
            : task.isWaiting
              ? 'text-amber-600/70 italic'
              : 'text-neutral-900'
        }`}
      >
        {task.title}
        {lineage && (
          <span className="mt-0.5 block truncate text-[12px] font-normal leading-snug text-neutral-500 no-underline">
            {lineage}
          </span>
        )}
      </button>


      {/* Trailing triage controls wrap as one unit (see the title above). */}
      <div className="ml-auto flex items-start gap-2 shrink-0">
      {/* Context dot — moved to the trailing controls so it sits with the rest
          of the triage affordances (assignee, when, delete) instead of crowding
          the title. Popover opens right-aligned to stay on-screen. */}
      {contextControl === 'readonly' ? (
        contextColor && (
          <span
            role="img"
            aria-label={`Life area: ${CONTEXT_OPTIONS.find((o) => o.value === task.context)?.label ?? ''}`}
            title={CONTEXT_OPTIONS.find((o) => o.value === task.context)?.label}
            className="mt-2 h-2 w-2 shrink-0 rounded-full"
            style={{ background: contextColor }}
          />
        )
      ) : (
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
          <div className="absolute z-40 top-full right-0 mt-1 bg-bg-elevated border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[120px]">
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
      )}

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
          hovered/focused so the default view stays calm. While selecting, the
          shared bulk toolbar is the one place to act (2026-09-22). */}
      {!selectionMode && <div
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
                className="rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
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
      </div>}
      </div>
    </div>
  )
})

/**
 * The Inbox's card (design B, 2026-10-07; canvas "Web Today in the iOS
 * style", board "Inbox"). The tile is the task's icon and its check — a tap
 * finishes it, a long hold marks it waiting, as the row's circle did.
 */
function InboxCard({
  task, familyMembers, contextColor, isLeaving, selectionMode, isSelected, onToggleSelection,
  onToggleComplete, onToggleWaiting, onSelect, onAssign, lineage, actions,
}: {
  task: Task
  familyMembers: FamilyMember[]
  contextColor?: string
  isLeaving?: boolean
  selectionMode: boolean
  isSelected: boolean
  onToggleSelection?: () => void
  onToggleComplete: () => void
  onToggleWaiting: () => void
  onSelect: () => void
  onAssign?: (memberIds: string[]) => void
  lineage?: string | null
  actions?: React.ReactNode
}) {
  const { pressing, handlers } = useLongPress({ threshold: 1500, onLongPress: onToggleWaiting, onPress: onToggleComplete })
  const icon = taskIconFor({ title: task.title, category: task.category, phoneNumber: task.phoneNumber, location: task.location, links: task.links, context: task.context })
  const preview = cardNotePreview(task.notes)
  const area = CONTEXT_OPTIONS.find((o) => o.value === task.context)?.label
  const tileLabel = task.completed
    ? `Mark not done: ${task.title}`
    : task.isWaiting
      ? `Waiting — tap to finish ${task.title}, hold to stop waiting`
      : `Done: ${task.title} (hold to mark waiting)`
  return (
    <div
      data-row
      data-task-id={task.id}
      className={`sym-card inbox-card${isSelected ? ' is-selected' : ''}${isLeaving ? ' is-leaving' : ''}`}
    >
      <div className="inbox-card-lead" onClick={(e) => e.stopPropagation()}>
        {selectionMode ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Select ${task.title}`}
            onClick={onToggleSelection}
            className={`inbox-card-select${isSelected ? ' is-on' : ''}`}
          >
            <Check className="h-5 w-5" strokeWidth={3} />
          </button>
        ) : (
          <button
            {...handlers}
            type="button"
            aria-label={tileLabel}
            aria-pressed={task.completed}
            // Mouse and touch finish through the press handlers; a keyboard
            // click (Enter/Space, detail 0) has no press, so it finishes here.
            onClick={(e) => { e.stopPropagation(); if (e.detail === 0) onToggleComplete() }}
            className={`sym-tile sym-tile-card${task.completed ? ' is-done' : ''}${task.isWaiting && !task.completed ? ' is-waiting' : ''}${pressing ? ' long-press-ring' : ''}`}
          >
            {task.completed ? <Check size={22} strokeWidth={2.6} /> : task.isWaiting ? <Hourglass size={20} strokeWidth={1.8} /> : createElement(icon, { size: 22, strokeWidth: 1.8 })}
          </button>
        )}
      </div>

      <div className="inbox-card-body">
        <button type="button" onClick={onSelect} className="inbox-card-open">
          <span className={`sym-card-title${task.completed ? ' is-done' : ''}`}>{task.title}</span>
          {lineage && <span className="inbox-card-lineage">{lineage}</span>}
        </button>
        {task.isWaiting && !task.completed && (
          <p className="inbox-card-wait"><Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />{task.waitingFor ? `Waiting on ${task.waitingFor}` : 'Waiting'}</p>
        )}
        {preview && <p className="sym-card-note">{preview}</p>}
        {!selectionMode && actions && <div className="inbox-card-actions">{actions}</div>}
      </div>

      <div className="inbox-card-trail">
        {task.captureId && <span className="sym-tag inbox-tag-source">From an email</span>}
        <span className="inbox-card-who">
          {contextColor && (
            <span role="img" aria-label={`Life area: ${area ?? ''}`} title={area} className="inbox-card-area" style={{ background: contextColor }} />
          )}
          {familyMembers.length > 0 && onAssign && (
            <span className="hidden md:block" onClick={(e) => e.stopPropagation()}>
              <MultiAssigneeDropdown members={familyMembers} selectedIds={task.assignedToAll ?? []} onSelect={onAssign} size="sm" />
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
