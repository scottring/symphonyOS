//
// The week's unplaced pool as a full-width lane above the planning grid —
// the calendar "all-day lane" pattern. A task lives HERE or on a day, never
// both. Pills are dnd-kit draggables (bare task.id, same as PlanningTaskCard)
// inside PlanningSession's DndContext; the lane doubles as the
// 'unscheduled-drawer' droppable so dragging a placed block back up here
// unschedules it. Pressing Tend swaps pills for proposal cards (review mode).
//
// `dragMode: 'native'` swaps dnd-kit wiring for plain HTML5 drag (the
// PlacementChip/MonthCalendarGrid 'text/task-id' convention) so this can
// render on pages with no DndContext (e.g. the month page). Outside a
// DndContext, dnd-kit's useDraggable/useDroppable don't throw — they silently
// no-op, so pills would render but never actually drag or drop. Native mode
// exists because MonthCalendarGrid speaks plain HTML5 dataTransfer, which
// dnd-kit's pointer-sensor protocol can't feed into; ShelfPill and
// DndShelfFrame (the dnd-kit hook callers) are therefore mounted exclusively
// in dndkit mode — PlanningShelf itself calls no dnd-kit hooks.

import {
  useMemo, useState,
  type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent,
} from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  Sparkles, Plus, X, Check, GitMerge, Archive,
  CornerRightDown, CalendarClock, Loader2, ChevronRight, ChevronDown, GripVertical,
} from 'lucide-react'
import type { Task, TaskBucket } from '@/types/task'
import type { TendState } from '@/hooks/useTendWeek'
import type { TendProposal } from '@/lib/tend/types'
import { TaskFateMenu } from '@/components/schedule/TaskFateMenu'
import { applyTriageWhen } from '@/lib/triage/applyWhen'

export const SHELF_COLLAPSED_COUNT = 8

export interface PlanningShelfProps {
  tasks: Task[]
  carryOverIds: Set<string>
  /** Ids that carried over because the WEEK they were placed on has passed and
   *  they never got a day (as opposed to a date coming and going). Their pill
   *  names the week it came from, so "carried over" reads as a fact about the
   *  plan rather than a mystery. */
  staleWeekIds?: Set<string>
  /** Resolve a stale placement by moving it onto the week being planned. The
   *  one fate a drag can't express: keep it unplaced, but stop it being late.
   *  Omitted = no such action offered. */
  onBringForward?: (id: string) => void
  projectsMap: Map<string, { id: string; name: string }>
  tasksById: Map<string, Task>
  onOpenTask: (id: string) => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Done is a first-class fate on the shelf — the week and the month are
   *  where finished things most often get noticed. */
  onCompleteTask: (id: string) => void
  /** Month page only: file a shelf move under a season pick (threads
   *  sourceId/goalId at the caller) — the page-side twin of the wizard's
   *  move-by-pick step. */
  fileUnder?: {
    picks: { id: string; title: string; goalName?: string }[]
    onFile: (taskId: string, pickId: string) => void
  }
  draft: string
  onDraftChange: (v: string) => void
  onSubmitDraft: () => void
  hiddenCount?: number
  showingAll?: boolean
  onToggleShowAll?: () => void
  tend: TendState
  onApplyProposal: (p: TendProposal) => void
  /** 'native' renders HTML5-draggable pills + a droppable lane with no
   *  dnd-kit hooks, for hosts with no DndContext (e.g. the month page). */
  dragMode?: 'dndkit' | 'native'
  /** native mode only: dropping a 'text/task-id' payload on the lane. */
  onNativeUnschedule?: (taskId: string) => void
  /** The add-pill's placeholder — speaks the host page's grain (week vs
   *  month). Defaults to the week page's copy. */
  draftPlaceholder?: string
  /** The reviewing-mode header's lead-in — speaks the host page's grain
   *  (week vs month). Defaults to the week page's copy. */
  tendingLabel?: string
  /** The non-reviewing header's lead-in, before the `(n)` count. Month
   *  reframes this as its own curated list (e.g. "July's moves") rather than
   *  a placement queue; week keeps the default. */
  poolLabel?: string
  /** Optional roll-up: render these sets as ONE collapsed line each (label +
   *  count) instead of N loose pills, so a month of five backyard steps reads
   *  as the single move it is. Members expand on tap. Tasks in no group render
   *  as ordinary pills after the groups. Omit for the flat shelf (week page). */
  groups?: ShelfGroup[]
  /** 'board' renders each group as a boxed block in a CSS multi-column, with
   *  every member always visible and a draggable cluster header. Used by
   *  /month, whose pool carries grouping and runs 20+ items; /week keeps the
   *  default wrap-flow, where a handful of pills reads fine. */
  layout?: 'flow' | 'board'
}

export interface ShelfGroup {
  id: string
  /** The move this cluster really is — a season pick, or the project. */
  label: string
  /** Board layout only. 'unfiled' is the residue, not a cluster: it renders
   *  last, hosts the composer, and gets no drag handle. */
  kind?: 'pick' | 'project' | 'unfiled'
  taskIds: string[]
}

// Module-level so the default prop keeps a stable identity across renders.
const EMPTY_IDS: Set<string> = new Set()

interface ShelfPillProps {
  task: Task
  carried: boolean
  staleWeek?: boolean
  onBringForward?: (id: string) => void
  projectName?: string
  onOpenTask: (id: string) => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onCompleteTask: (id: string) => void
  fileUnder?: PlanningShelfProps['fileUnder']
}

function pillClassName(carried: boolean) {
  return `group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm touch-none cursor-grab active:cursor-grabbing transition-shadow hover:shadow-sm ${
    carried ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-200'
  }`
}

// A pill sits inside a drag handle (dnd-kit listeners in dndkit mode, an HTML5
// `draggable` root in native mode) AND inside a click-to-open target. An inline
// button must therefore stop the pointer BEFORE the sensor arms a drag and stop
// the click before it opens the task — same guard the draft input uses below.
const stopDragAndOpen = {
  onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
  onMouseDown: (e: ReactMouseEvent) => e.stopPropagation(),
}

function ShelfPillContent({
  task, projectName, staleWeek, onBringForward, onOpenTask, onSetBucket, onDeleteTask, onPushTask, onCompleteTask, fileUnder,
}: Omit<ShelfPillProps, 'carried'>) {
  return (
    <>
      {/* Done in one tap. The two fates a pill earns most on a planning
          surface — it's finished, or it never should have been here — were
          both buried two clicks deep in the ⋯ menu. The menu still carries
          them (and everything else); these are the shortcuts. */}
      <button
        type="button"
        aria-label={`Complete ${task.title}`}
        title="Mark complete"
        {...stopDragAndOpen}
        onClick={(e) => { e.stopPropagation(); onCompleteTask(task.id) }}
        className="shrink-0 w-4 h-4 rounded-full border-[1.5px] border-neutral-300 text-transparent grid place-items-center cursor-pointer transition-colors hover:border-primary-500 hover:bg-primary-500 hover:text-white"
      >
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      </button>
      <span data-testid="shelf-pill-title" className="text-neutral-700">{task.title}</span>
      {projectName && <span className="text-xs text-neutral-400">· {projectName}</span>}
      {/* Amber alone says "late"; this says late FROM WHERE. A move placed on a
          week that came and went is a specific, legible fact about the plan. */}
      {staleWeek && task.weekStart && (
        <span data-testid="stale-week-tag" className="text-xs text-amber-700 whitespace-nowrap">
          · from {task.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
      {/* The full fate vocabulary, one trigger. TaskFateMenu hosts the SAME
          TriageWhenMenu the review rows render inline, so a pill on the week
          shelf offers exactly the verbs a wizard row does — including Done,
          which the shelf lacked for months. */}
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label={`Delete ${task.title}`}
          title="Delete"
          {...stopDragAndOpen}
          onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id) }}
          className="p-0.5 rounded text-neutral-400 cursor-pointer transition-colors hover:text-red-600 hover:bg-red-50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <TaskFateMenu
          onOpen={() => onOpenTask(task.id)}
          extras={staleWeek && onBringForward
            ? [{ label: 'Bring to this week', onSelect: () => onBringForward(task.id) }]
            : undefined}
          fileUnder={fileUnder
            ? { picks: fileUnder.picks, onFile: (pickId) => fileUnder.onFile(task.id, pickId) }
            : undefined}
          onPickWhen={(when) => applyTriageWhen(when, task.id, { onPushTask, onSetBucket })}
          onPickDate={(date) => onPushTask(task.id, date)}
          onComplete={() => onCompleteTask(task.id)}
          onDelete={() => onDeleteTask(task.id)}
        />
      </span>
    </>
  )
}

function ShelfPill({ carried, ...rest }: ShelfPillProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: rest.task.id })

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${pillClassName(carried)} ${isDragging ? 'opacity-40' : ''}`}
      onClick={() => rest.onOpenTask(rest.task.id)}
      {...attributes}
      {...listeners}
    >
      <ShelfPillContent {...rest} />
    </div>
  )
}

function NativeShelfPill({ carried, ...rest }: ShelfPillProps) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/task-id', rest.task.id)}
      className={pillClassName(carried)}
      onClick={() => rest.onOpenTask(rest.task.id)}
    >
      <ShelfPillContent {...rest} />
    </div>
  )
}

const PROPOSAL_META: Record<TendProposal['kind'], { label: string; applyLabel: string; Icon: typeof GitMerge; tone: string }> = {
  merge: { label: 'Duplicates', applyLabel: 'Merge', Icon: GitMerge, tone: 'text-amber-700' },
  put_aside: { label: 'Stale', applyLabel: 'Put aside', Icon: Archive, tone: 'text-neutral-500' },
  regrade: { label: 'Wrong size', applyLabel: 'Move', Icon: CornerRightDown, tone: 'text-sky-700' },
  place: { label: 'Placement', applyLabel: 'Place', Icon: CalendarClock, tone: 'text-primary-700' },
}

function proposalTitles(p: TendProposal, tasksById: Map<string, Task>): string[] {
  const ids = p.kind === 'merge' ? [p.keepId, ...p.dropIds] : p.kind === 'place' ? p.taskIds : [p.taskId]
  return ids.map((id) => tasksById.get(id)?.title ?? '(missing task)')
}

function frameClassName(isOver: boolean) {
  return `rounded-xl border px-4 py-3 transition-colors ${
    isOver ? 'bg-primary-50 border-primary-300' : 'bg-neutral-50/70 border-neutral-200'
  }`
}

// Outside a DndContext, dnd-kit's useDroppable doesn't throw — it silently
// no-ops (never reports isOver, never registers a drop target), so this
// lives only in this child, mounted exclusively when dragMode === 'dndkit'.
function DndShelfFrame({ children }: { children: (isOver: boolean) => ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'unscheduled-drawer' })
  return (
    <div ref={setNodeRef} data-testid="shelf-lane" className={frameClassName(isOver)}>
      {children(isOver)}
    </div>
  )
}

function NativeShelfFrame({ onNativeUnschedule, children }: {
  onNativeUnschedule?: (taskId: string) => void
  children: (isOver: boolean) => ReactNode
}) {
  const [isOver, setIsOver] = useState(false)
  return (
    <div
      data-testid="shelf-lane"
      className={frameClassName(isOver)}
      onDragOver={(e) => { e.preventDefault(); setIsOver(true) }}
      onDragLeave={(e) => {
        // dragleave fires on every child-boundary crossing too, not just when
        // leaving the frame itself — only clear isOver once the pointer has
        // actually left the frame's subtree, or hovering over a child pill
        // flickers the highlight off and back on.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsOver(false)
        const many = e.dataTransfer.getData('text/task-ids')
        const id = many ? many.split(',').filter(Boolean)[0] : e.dataTransfer.getData('text/task-id')
        if (id) onNativeUnschedule?.(id)
      }}
    >
      {children(isOver)}
    </div>
  )
}

// One block on the board. The header is the cluster's drag handle: dropping
// it on a week row places every member at once, which is the whole payoff of
// grouping — placing 24 moves one at a time is the chore the board exists to
// kill. Unfiled gets no handle (see ShelfGroup.kind).
function ShelfBlock({ group, members, draggable: canDrag, children }: {
  group: ShelfGroup
  members: Task[]
  draggable: boolean
  children: ReactNode
}) {
  return (
    <div
      data-testid={`shelf-block-${group.id}`}
      className="mb-2 break-inside-avoid rounded-lg border border-neutral-200 bg-white px-3 py-2"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {canDrag && (
          <span
            data-testid={`shelf-block-drag-${group.id}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/task-ids', members.map((t) => t.id).join(','))}
            title={`Place all ${members.length} on a week`}
            className="shrink-0 cursor-grab active:cursor-grabbing text-neutral-300 hover:text-primary-500 transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <span className={`flex-1 min-w-0 text-[11px] font-semibold uppercase tracking-wide truncate ${
          group.kind === 'unfiled' ? 'text-neutral-400' : 'text-primary-800'
        }`}>
          {group.label}
        </span>
        <span className="shrink-0 text-[11px] text-neutral-400">{members.length}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

export function PlanningShelf(props: PlanningShelfProps) {
  const {
    tasks, carryOverIds, staleWeekIds = EMPTY_IDS, onBringForward,
    projectsMap, tasksById, onOpenTask, onSetBucket, onDeleteTask, onPushTask,
    onCompleteTask, fileUnder,
    draft, onDraftChange, onSubmitDraft, hiddenCount = 0, showingAll = false, onToggleShowAll,
    tend, onApplyProposal, dragMode = 'dndkit', onNativeUnschedule,
    draftPlaceholder = 'Add to this week…', tendingLabel = 'Tending this week',
    poolLabel = 'To place', groups, layout = 'flow',
  } = props
  const [expanded, setExpanded] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())

  // Stale week placements → other carried-over → project-grouped (by name) →
  // loose. Stable within groups.
  //
  // Stale placements lead because they're the easiest thing here to lose: only
  // the first SHELF_COLLAPSED_COUNT pills render, so a stranded move sitting
  // behind ten overdue items would hide under "+N more" — on the one surface
  // built to stop it being forgotten.
  const ordered = useMemo(() => {
    const stale: Task[] = []
    const carried: Task[] = []
    const byProject = new Map<string, Task[]>()
    const loose: Task[] = []
    for (const t of tasks) {
      if (staleWeekIds.has(t.id)) { stale.push(t); continue }
      if (carryOverIds.has(t.id)) { carried.push(t); continue }
      const p = t.projectId ? projectsMap.get(t.projectId) : undefined
      if (p) {
        const arr = byProject.get(p.id) ?? []
        arr.push(t)
        byProject.set(p.id, arr)
      } else loose.push(t)
    }
    return [...stale, ...carried, ...[...byProject.values()].flat(), ...loose]
  }, [tasks, carryOverIds, staleWeekIds, projectsMap])

  // Rolled-up members leave the flat run; the header count still speaks for
  // the whole list, so the month reads as "8 moves", not "21 chores".
  const { rolled, ungrouped } = useMemo(() => {
    if (!groups || groups.length === 0) return { rolled: [] as { group: ShelfGroup; tasks: Task[] }[], ungrouped: ordered }
    const byId = new Map(ordered.map((t) => [t.id, t]))
    const taken = new Set<string>()
    const rolled = groups.map((group) => {
      const members: Task[] = []
      for (const id of group.taskIds) {
        const t = byId.get(id)
        if (!t || taken.has(id)) continue
        taken.add(id)
        members.push(t)
      }
      return { group, tasks: members }
    }).filter((g) => g.tasks.length > 0)
    return { rolled, ungrouped: ordered.filter((t) => !taken.has(t.id)) }
  }, [groups, ordered])

  // Board blocks. monthShelfGroups is a total partition, so `ungrouped` is
  // normally empty — but folding any remainder into Unfiled here keeps this
  // component correct for any caller, since the board renders blocks and
  // nothing else. Unfiled always exists in board mode even at zero members:
  // it hosts the composer, and a newly captured chunk starts unfiled.
  const boardBlocks = useMemo(() => {
    if (layout !== 'board') return [] as { group: ShelfGroup; tasks: Task[] }[]
    const blocks = rolled.filter((b) => b.group.kind !== 'unfiled')
    const unfiledGroup = rolled.find((b) => b.group.kind === 'unfiled')
    const unfiledTasks = [...(unfiledGroup?.tasks ?? []), ...ungrouped]
    return [
      ...blocks,
      { group: unfiledGroup?.group ?? { id: 'unfiled', label: 'Unfiled', kind: 'unfiled' as const, taskIds: [] }, tasks: unfiledTasks },
    ]
  }, [layout, rolled, ungrouped])

  const visible = expanded ? ungrouped : ungrouped.slice(0, SHELF_COLLAPSED_COUNT)
  const overflow = ungrouped.length - visible.length
  const carriedCount = ordered.filter((t) => carryOverIds.has(t.id)).length
  const reviewing = tend.status === 'reviewing'
  const Pill = dragMode === 'native' ? NativeShelfPill : ShelfPill

  const composer = (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1.5">
      <button type="button" onClick={onSubmitDraft} aria-label="Add task"
        className="w-5 h-5 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700">
        <Plus className="w-3.5 h-3.5" />
      </button>
      <input type="text" value={draft} onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmitDraft() }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder={draftPlaceholder}
        className="w-64 bg-transparent text-sm placeholder:text-neutral-400 focus:outline-none" />
    </span>
  )

  const content = (isOver: boolean) => (
    <>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-neutral-400">
          {reviewing
            ? `${tendingLabel} · ${tend.proposals.length} suggestion${tend.proposals.length === 1 ? '' : 's'}`
            : `${poolLabel} (${ordered.length})${carriedCount > 0 ? ` · ${carriedCount} carried over` : ''}`}
        </h2>
        {reviewing ? (
          <button type="button" onClick={tend.done}
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800">
            <X className="w-3.5 h-3.5" /> Done
          </button>
        ) : (
          <button type="button" onClick={tend.start} aria-label="Tend this list"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
            <Sparkles className="w-3.5 h-3.5" /> Tend
          </button>
        )}
      </div>

      {reviewing ? (
        <div className="flex flex-wrap gap-2">
          {tend.proposals.map((p) => {
            const meta = PROPOSAL_META[p.kind]
            const titles = proposalTitles(p, tasksById)
            return (
              <div key={p.id} className="w-full sm:w-[calc(50%-4px)] lg:w-[calc(25%-6px)] rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <div className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}>
                  <meta.Icon className="w-3 h-3" /> {meta.label}
                  {p.kind === 'regrade' && <span className="normal-case font-normal">→ {p.to}</span>}
                  {p.kind === 'place' && <span className="normal-case font-normal">→ {p.date}{p.time ? ` ${p.time}` : ''}</span>}
                </div>
                <div className="mt-1 text-sm text-neutral-700">
                  {titles.map((t, i) => (
                    <div key={i} className={p.kind === 'merge' && i > 0 ? 'line-through text-neutral-400' : ''}>{t}</div>
                  ))}
                </div>
                {p.why && <p className="mt-1 text-xs text-neutral-400">{p.why}</p>}
                <div className="mt-2 flex gap-2">
                  <button type="button"
                    onClick={() => { onApplyProposal(p); tend.remove(p.id) }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary-600 text-white hover:bg-primary-700">
                    {meta.applyLabel}
                  </button>
                  <button type="button" onClick={() => tend.remove(p.id)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50">
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
          {tend.aiLoading && (
            <p className="w-full flex items-center gap-2 text-xs text-neutral-400 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking for more…
            </p>
          )}
          {!tend.aiLoading && tend.proposals.length === 0 && (
            <p className="w-full text-sm text-neutral-400 py-1">
              {tend.aiError ? 'Couldn’t tend the list — try again.' : 'Nothing to tend — this list looks healthy.'}
            </p>
          )}
          {!tend.aiLoading && tend.aiError && tend.proposals.length > 0 && (
            <p className="w-full text-xs text-neutral-400">AI pass failed — showing the built-in checks only.</p>
          )}
        </div>
      ) : layout === 'board' ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-2">
          {boardBlocks.map(({ group, tasks: members }) => (
            <ShelfBlock
              key={group.id}
              group={group}
              members={members}
              draggable={dragMode === 'native' && group.kind !== 'unfiled' && members.length > 0}
            >
              {members.map((t) => (
                <Pill key={t.id} task={t} carried={carryOverIds.has(t.id)}
                  staleWeek={staleWeekIds.has(t.id)} onBringForward={onBringForward}
                  projectName={t.projectId ? projectsMap.get(t.projectId)?.name : undefined}
                  onOpenTask={onOpenTask} onSetBucket={onSetBucket} onDeleteTask={onDeleteTask}
                  onPushTask={onPushTask} onCompleteTask={onCompleteTask} fileUnder={fileUnder} />
              ))}
              {group.kind === 'unfiled' && composer}
            </ShelfBlock>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {rolled.map(({ group, tasks: members }) => {
            const open = openGroups.has(group.id)
            return (
              <div key={group.id} className="w-full">
                <button type="button"
                  onClick={() => setOpenGroups((prev) => {
                    const next = new Set(prev)
                    if (next.has(group.id)) next.delete(group.id); else next.add(group.id)
                    return next
                  })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50/60 px-3 py-1.5 text-sm text-primary-800 hover:bg-primary-100 transition-colors">
                  {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span className="font-medium">{group.label}</span>
                  <span className="text-primary-600/70">({members.length})</span>
                </button>
                {open && (
                  <div className="mt-2 ml-5 flex flex-wrap items-center gap-2">
                    {members.map((t) => (
                      <Pill key={t.id} task={t} carried={carryOverIds.has(t.id)}
                        staleWeek={staleWeekIds.has(t.id)} onBringForward={onBringForward}
                        projectName={t.projectId ? projectsMap.get(t.projectId)?.name : undefined}
                        onOpenTask={onOpenTask} onSetBucket={onSetBucket} onDeleteTask={onDeleteTask} onPushTask={onPushTask}
                        onCompleteTask={onCompleteTask} fileUnder={fileUnder} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {visible.map((t) => (
            <Pill key={t.id} task={t} carried={carryOverIds.has(t.id)}
              staleWeek={staleWeekIds.has(t.id)} onBringForward={onBringForward}
              projectName={t.projectId ? projectsMap.get(t.projectId)?.name : undefined}
              onOpenTask={onOpenTask} onSetBucket={onSetBucket} onDeleteTask={onDeleteTask} onPushTask={onPushTask}
              onCompleteTask={onCompleteTask} fileUnder={fileUnder} />
          ))}
          {overflow > 0 && (
            <button type="button" onClick={() => setExpanded(true)}
              className="text-sm text-neutral-400 hover:text-neutral-700 px-2 py-1">
              +{overflow} more
            </button>
          )}
          {expanded && ordered.length > SHELF_COLLAPSED_COUNT && (
            <button type="button" onClick={() => setExpanded(false)}
              className="text-sm text-neutral-400 hover:text-neutral-700 px-2 py-1">
              Show fewer
            </button>
          )}
          {onToggleShowAll && (hiddenCount > 0 || showingAll) && (
            <button type="button" onClick={onToggleShowAll}
              className="text-sm text-neutral-400 hover:text-neutral-700 px-2 py-1">
              {showingAll ? 'Week only' : `+${hiddenCount} from the backlog`}
            </button>
          )}
          {composer}
          {ordered.length === 0 && (
            <span className="text-sm text-neutral-400 py-1">
              {isOver ? 'Drop to unschedule' : 'Everything is placed on a day.'}
            </span>
          )}
        </div>
      )}
    </>
  )

  return dragMode === 'native' ? (
    <NativeShelfFrame onNativeUnschedule={onNativeUnschedule}>{content}</NativeShelfFrame>
  ) : (
    <DndShelfFrame>{content}</DndShelfFrame>
  )
}
