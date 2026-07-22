//
// The week's unplaced pool as a full-width lane above the planning grid —
// the calendar "all-day lane" pattern. A task lives HERE or on a day, never
// both. Pills are dnd-kit draggables (bare task.id, same as PlanningTaskCard)
// inside PlanningSession's DndContext; the lane doubles as the
// 'unscheduled-drawer' droppable so dragging a placed block back up here
// unschedules it. Pressing Tend swaps pills for proposal cards (review mode).

import { useMemo, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  Sparkles, Plus, MoreHorizontal, X, GitMerge, Archive,
  CornerRightDown, CalendarClock, Loader2,
} from 'lucide-react'
import type { Task } from '@/types/task'
import type { TendState } from '@/hooks/useTendWeek'
import type { TendProposal } from '@/lib/tend/types'
import { PushDropdown } from '@/components/triage'

export const SHELF_COLLAPSED_COUNT = 8

export interface PlanningShelfProps {
  tasks: Task[]
  carryOverIds: Set<string>
  projectsMap: Map<string, { id: string; name: string }>
  tasksById: Map<string, Task>
  onOpenTask: (id: string) => void
  onSetBucket: (id: string, bucket: 'month' | 'someday') => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  draft: string
  onDraftChange: (v: string) => void
  onSubmitDraft: () => void
  hiddenCount?: number
  showingAll?: boolean
  onToggleShowAll?: () => void
  tend: TendState
  onApplyProposal: (p: TendProposal) => void
}

function ShelfPill({ task, carried, projectName, onOpenTask, onSetBucket, onDeleteTask, onPushTask }: {
  task: Task
  carried: boolean
  projectName?: string
  onOpenTask: (id: string) => void
  onSetBucket: (id: string, bucket: 'month' | 'someday') => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const [menuOpen, setMenuOpen] = useState(false)
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm touch-none cursor-grab active:cursor-grabbing transition-shadow hover:shadow-sm ${
        isDragging ? 'opacity-40' : ''
      } ${carried ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-200'}`}
      {...attributes}
      {...listeners}
    >
      <span data-testid="shelf-pill-title" className="text-neutral-700">{task.title}</span>
      {projectName && <span className="text-xs text-neutral-400">· {projectName}</span>}
      <span
        className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <PushDropdown size="sm" onPush={(date) => onPushTask(task.id, date)} />
        <button
          type="button"
          aria-label="Task actions"
          onClick={() => setMenuOpen((v) => !v)}
          className="p-0.5 rounded text-neutral-400 hover:text-neutral-700"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </span>
      {menuOpen && (
        <div role="menu" className="absolute top-full left-0 mt-1 z-30 w-36 rounded-lg border border-neutral-200 bg-white shadow-lg py-1 text-sm"
          onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 hover:bg-neutral-50"
            onClick={() => { setMenuOpen(false); onOpenTask(task.id) }}>Open</button>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 hover:bg-neutral-50"
            onClick={() => { setMenuOpen(false); onSetBucket(task.id, 'month') }}>To month</button>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 hover:bg-neutral-50"
            onClick={() => { setMenuOpen(false); onSetBucket(task.id, 'someday') }}>Put aside</button>
          <button role="menuitem" type="button" className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50"
            onClick={() => { setMenuOpen(false); onDeleteTask(task.id) }}>Delete</button>
        </div>
      )}
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

export function PlanningShelf(props: PlanningShelfProps) {
  const {
    tasks, carryOverIds, projectsMap, tasksById, onOpenTask, onSetBucket, onDeleteTask, onPushTask,
    draft, onDraftChange, onSubmitDraft, hiddenCount = 0, showingAll = false, onToggleShowAll,
    tend, onApplyProposal,
  } = props
  const { isOver, setNodeRef } = useDroppable({ id: 'unscheduled-drawer' })
  const [expanded, setExpanded] = useState(false)

  // Carried-over → project-grouped (by name) → loose. Stable within groups.
  const ordered = useMemo(() => {
    const carried: Task[] = []
    const byProject = new Map<string, Task[]>()
    const loose: Task[] = []
    for (const t of tasks) {
      if (carryOverIds.has(t.id)) { carried.push(t); continue }
      const p = t.projectId ? projectsMap.get(t.projectId) : undefined
      if (p) {
        const arr = byProject.get(p.id) ?? []
        arr.push(t)
        byProject.set(p.id, arr)
      } else loose.push(t)
    }
    return [...carried, ...[...byProject.values()].flat(), ...loose]
  }, [tasks, carryOverIds, projectsMap])

  const visible = expanded ? ordered : ordered.slice(0, SHELF_COLLAPSED_COUNT)
  const overflow = ordered.length - visible.length
  const carriedCount = ordered.filter((t) => carryOverIds.has(t.id)).length
  const reviewing = tend.status === 'reviewing'

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border px-4 py-3 transition-colors ${
        isOver ? 'bg-primary-50 border-primary-300' : 'bg-neutral-50/70 border-neutral-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-neutral-400">
          {reviewing
            ? `Tending this week · ${tend.proposals.length} suggestion${tend.proposals.length === 1 ? '' : 's'}`
            : `To place (${ordered.length})${carriedCount > 0 ? ` · ${carriedCount} carried over` : ''}`}
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
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {visible.map((t) => (
            <ShelfPill key={t.id} task={t} carried={carryOverIds.has(t.id)}
              projectName={t.projectId ? projectsMap.get(t.projectId)?.name : undefined}
              onOpenTask={onOpenTask} onSetBucket={onSetBucket} onDeleteTask={onDeleteTask} onPushTask={onPushTask} />
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1.5">
            <button type="button" onClick={onSubmitDraft} aria-label="Add task"
              className="w-5 h-5 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <input type="text" value={draft} onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmitDraft() }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Add to this week…"
              className="w-36 bg-transparent text-sm placeholder:text-neutral-400 focus:outline-none" />
          </span>
          {ordered.length === 0 && (
            <span className="text-sm text-neutral-400 py-1">
              {isOver ? 'Drop to unschedule' : 'Everything is placed on a day.'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
