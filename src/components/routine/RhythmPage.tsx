import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Sparkles, RefreshCw, Wrench } from 'lucide-react'
import type { RecurrencePattern, Routine } from '@/types/actionable'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { TapRoutinePanel } from '@/components/surface/TapRoutinePanel'
import { TapStepPanel } from '@/components/surface/TapStepPanel'
import { buildRhythmModel, DAY_ORDER, minutesOf, type DayKey, type RhythmCard } from './rhythm/rhythmModel'

const DAY_FULL: Record<DayKey, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
}
import { findTend, tendFindingKey } from './rhythm/tendHeuristics'
import { DailyArc } from './rhythm/DailyArc'
import { WeekStrip } from './rhythm/WeekStrip'
import { SometimesShelf } from './rhythm/SometimesShelf'
import { TendDrawer } from './rhythm/TendDrawer'
import type { DropIntent } from './rhythm/dropRules'

interface RhythmPageProps {
  routines: Routine[]
  /** Hold the empty state until the first load settles. */
  loading?: boolean
  contacts?: Contact[]
  familyMembers?: FamilyMember[]
  onCreateRoutine: () => void
  onUpdateRoutine: (id: string, updates: UpdateRoutineInput) => Promise<boolean> | void
  onAddStep: (collectionId: string, name: string) => void
  /** Batch step creation (document → steps extraction). */
  onAddSteps?: (collectionId: string, steps: { name: string; detail?: string }[]) => void | Promise<unknown>
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
  onPromoteStep: (stepId: string) => void
  /** Delete a step routine entirely (swap-out). Optional — hides the action when absent. */
  onDeleteStep?: (stepId: string) => void
  /** Delete a top-level routine (RoutinesApp already passes this — it was silently dropped before). */
  onDelete?: (id: string) => void
  onCreateCollection?: (name: string) => Promise<Routine | null> | void
  onGroupIntoCollection?: (
    name: string,
    routineIds: string[],
    opts?: { time_of_day?: string; recurrence_pattern?: RecurrencePattern },
  ) => void
  /** Fold existing routines into an existing routine as its steps. */
  onAddToCollection?: (collectionId: string, routineIds: string[]) => void
  /** Open the AI routine builder (paste text / drop a PDF → proposed routine). */
  onBuildWithAI?: () => void
}

export function RhythmPage(props: RhythmPageProps) {
  const {
    routines, loading = false, familyMembers = [],
    onUpdateRoutine, onDelete, onGroupIntoCollection, onBuildWithAI, onCreateCollection,
    onAddToCollection,
  } = props

  const [memberId, setMemberId] = useState<string | null>(null)
  // A focused Through-the-week day: the arc shows that day's full picture.
  const [focusDay, setFocusDay] = useState<DayKey | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<{ kind: 'routine' | 'standalone-step' | 'step'; id: string } | null>(null)
  const [tendOpen, setTendOpen] = useState(false)

  const model = useMemo(() => buildRhythmModel(routines, { memberId, focusDay }), [routines, memberId, focusDay])

  // Dismissed tend suggestions persist so a rejected grouping stays gone.
  const [dismissedTend, setDismissedTend] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rhythm-tend-dismissed') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const dismissTend = (key: string) => {
    setDismissedTend(prev => {
      const next = prev.includes(key) ? prev : [...prev, key]
      localStorage.setItem('rhythm-tend-dismissed', JSON.stringify(next))
      return next
    })
  }
  const findings = useMemo(
    () => findTend(routines).filter(f => !dismissedTend.includes(tendFindingKey(f))),
    [routines, dismissedTend],
  )
  const tendCount = findings.length
  const { collections } = useMemo(() => groupRoutineSteps(routines), [routines])
  const collectionSteps = useMemo(
    () => Object.fromEntries(collections.map(c => [c.id, c.steps])),
    [collections],
  )

  // Type-anywhere search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input,textarea,[contenteditable="true"]')) return
      if (open || tendOpen) return
      if (e.key === 'Escape') { setQuery(''); return }
      if (e.key === 'Backspace') { e.preventDefault(); setQuery(q => q.slice(0, -1)); return }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setQuery(q => q + e.key) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, tendOpen])

  const q = query.trim().toLowerCase()
  const matches = (r: Routine): boolean => {
    if (!q) return true
    if (r.name.toLowerCase().includes(q)) return true
    const coll = collections.find(c => c.id === r.id)
    return coll?.steps.some(s => s.name.toLowerCase().includes(q)) ?? false
  }

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todayKey = DAY_ORDER[now.getDay()]
  const subtitle = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const handleNameCluster = (card: RhythmCard, name: string) => {
    // Stamp the cluster's start time + daily recurrence on the new collection
    // so it stays in place on the arc instead of landing untimed at the end.
    onGroupIntoCollection?.(name, card.routines.map(r => r.id), {
      time_of_day: card.startTime?.slice(0, 5) ?? undefined,
      recurrence_pattern: { type: 'daily' },
    })
  }
  const routineById = useMemo(() => new Map(routines.map(r => [r.id, r])), [routines])
  const isDailyZone = (r: Routine) => {
    const p = r.recurrence_pattern
    return p.type === 'daily' || (p.type === 'weekly' && (p.days?.length ?? 0) >= 5)
  }
  const fmtMinutes = (n: number) => {
    const clamped = Math.min(Math.max(n, 0), 24 * 60 - 5)
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
  }
  const executeDropIntent = (intent: DropIntent) => {
    switch (intent.type) {
      case 'add-steps': {
        const ids = intent.ids.filter(id => routineById.get(id)?.parent_routine_id !== intent.collectionId)
        if (ids.length > 0) onAddToCollection?.(intent.collectionId, ids)
        return
      }
      case 'stand-alone-at':
        props.onPromoteStep(intent.id)
        onUpdateRoutine(intent.id, { time_of_day: intent.time, recurrence_pattern: { type: 'daily' } })
        return
      case 'retime': {
        const r = routineById.get(intent.id)
        if (!r) return
        onUpdateRoutine(intent.id, isDailyZone(r)
          ? { time_of_day: intent.time }
          : { time_of_day: intent.time, recurrence_pattern: { type: 'daily' } })
        return
      }
      case 'shift-group': {
        const members = intent.ids
          .map(id => routineById.get(id))
          .filter((r): r is Routine => !!r && minutesOf(r.time_of_day) != null)
        if (members.length === 0) return
        const earliest = Math.min(...members.map(m => minutesOf(m.time_of_day)!))
        const delta = (minutesOf(intent.time) ?? earliest) - earliest
        for (const m of members) {
          onUpdateRoutine(m.id, { time_of_day: fmtMinutes(minutesOf(m.time_of_day)! + delta) })
        }
        return
      }
      case 'weekly-on': {
        for (const id of intent.ids) {
          if (routineById.get(id)?.parent_routine_id) props.onPromoteStep(id)
          onUpdateRoutine(id, { recurrence_pattern: { type: 'weekly', days: [intent.day] } })
        }
        return
      }
      case 'move-day': {
        const r = routineById.get(intent.id)
        if (!r) return
        const p = r.recurrence_pattern
        if (!p.days || p.days.length === 0) {
          onUpdateRoutine(intent.id, { recurrence_pattern: { type: 'weekly', days: [intent.toDay] } })
          return
        }
        const set = new Set(p.days.filter(d => d !== intent.fromDay))
        set.add(intent.toDay)
        onUpdateRoutine(intent.id, { recurrence_pattern: { ...p, days: DAY_ORDER.filter(d => set.has(d)) } })
        return
      }
    }
  }
  // Any active top-level routine can absorb others as steps (an empty shell
  // like a step-less collection counts — folding in gives it its steps).
  const foldTargets = useMemo(
    () => routines
      .filter(r => !r.parent_routine_id && r.visibility === 'active')
      .map(r => ({ id: r.id, name: r.name })),
    [routines],
  )
  const handleWakeAll = () => {
    for (const r of model.seasonal) onUpdateRoutine(r.id, { visibility: 'active', paused_until: null })
  }
  const handleMerge = (_survivorId: string, loserIds: string[]) => {
    for (const id of loserIds) onDelete?.(id)
  }

  // --- open-panel resolution (routine/standalone-step/step kinds) ---
  const cs = collections
  const openRoutineItem =
    open?.kind === 'routine' || open?.kind === 'standalone-step'
      ? (cs.find(c => c.id === open.id)
         ?? (() => {
              const r = routines.find(x => x.id === open.id && !x.parent_routine_id)
              return r ? { ...r, steps: [] as Routine[] } : undefined
            })())
      : undefined
  const openWithSteps = open?.kind === 'routine'
  const openStep = open?.kind === 'step' ? cs.flatMap(c => c.steps).find(s => s.id === open.id) : undefined
  const parentOfOpenStep = openStep ? cs.find(c => c.steps.some(s => s.id === openStep.id)) : undefined

  const openRoutine = (r: Routine) =>
    setOpen({ kind: model.stepCounts[r.id] ? 'routine' : 'standalone-step', id: r.id })

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Full-width canvas (keeps the shared gutter, drops the 940px cap) —
          the staggered timeline needs the room; approved deviation from PAGE_COLUMN. */}
      <div className="relative w-full px-6 md:px-10 lg:px-14 py-8">
        {/* Masthead */}
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-800">Routines</h1>
            <p className="mt-1 text-sm text-neutral-500">How your family runs — {subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type anywhere to find"
                className="w-40 bg-transparent text-sm focus:outline-none placeholder:text-neutral-400"
              />
            </div>
            {onBuildWithAI && (
              <button onClick={onBuildWithAI}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5
                           font-medium text-neutral-700 shadow-sm hover:border-amber-300 transition-colors">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Build with AI
              </button>
            )}
            <button
              onClick={() => setTendOpen(true)}
              className="relative flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5
                         font-medium text-neutral-700 shadow-sm hover:border-emerald-400 transition-colors"
            >
              <Wrench className="w-4 h-4 text-emerald-700" />
              Tend
              {tendCount > 0 && (
                <span className="ml-0.5 rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {tendCount}
                </span>
              )}
            </button>
            <button
              onClick={async () => {
                if (!onCreateCollection) return
                const created = await onCreateCollection('New routine')
                if (created) setOpen({ kind: 'standalone-step', id: created.id })
              }}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-medium text-white
                         shadow-sm hover:bg-amber-600 active:bg-amber-700 transition-colors">
              <Plus className="w-5 h-5" />
              New routine
            </button>
          </div>
        </div>

        {/* People pills */}
        {familyMembers.length > 0 && (
          <div className="mb-6 flex items-center gap-1.5 flex-wrap">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Whose week</span>
            <button onClick={() => setMemberId(null)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                memberId === null ? 'bg-[var(--color-primary-500,#3d5a44)] text-white' : 'border border-neutral-200 bg-white text-neutral-600'
              }`}>
              Everyone
            </button>
            {[...familyMembers].sort((a, b) => a.display_order - b.display_order).map(m => (
              <button key={m.id} onClick={() => setMemberId(memberId === m.id ? null : m.id)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  memberId === m.id ? 'bg-[var(--color-primary-500,#3d5a44)] text-white' : 'border border-neutral-200 bg-white text-neutral-600'
                }`}>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {loading && routines.length === 0 && (
          <p className="py-16 text-center text-neutral-400">Loading your week…</p>
        )}

        {!loading && routines.length === 0 && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100">
              <RefreshCw className="h-10 w-10 text-amber-600" />
            </div>
            <h2 className="font-display mb-2 text-xl font-semibold text-neutral-700">No routines yet</h2>
            <p className="mx-auto mb-6 max-w-sm text-neutral-500">
              Capture your first routine and Symphony will start painting your week.
            </p>
            <button
              onClick={async () => {
                if (!onCreateCollection) return
                const created = await onCreateCollection('New routine')
                if (created) setOpen({ kind: 'standalone-step', id: created.id })
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-medium text-white
                         shadow-sm hover:bg-amber-600 transition-colors">
              <Plus className="h-5 w-5" />
              Create your first routine
            </button>
          </div>
        )}

        <div>
          <DailyArc
            cards={model.daily.timed}
            anytime={model.daily.anytime}
            familyMembers={familyMembers}
            matches={matches}
            nowMinutes={nowMinutes}
            heading={focusDay ? `${DAY_FULL[focusDay]} — the whole day` : undefined}
            onOpenCollection={id => setOpen({ kind: 'routine', id })}
            onOpenRoutine={openRoutine}
            onDropIntent={executeDropIntent}
            foldTargets={foldTargets}
            onNameGroup={handleNameCluster}
            onFoldInto={(targetId, ids) => onAddToCollection?.(targetId, ids)}
          />
        </div>

        <div>
          <WeekStrip
            days={model.week.days}
            sometime={model.week.sometime}
            stepCounts={model.stepCounts}
            matches={matches}
            todayKey={todayKey}
            onOpenRoutine={openRoutine}
            familyMembers={familyMembers}
            collectionSteps={collectionSteps}
            onDropIntent={executeDropIntent}
            selectedDay={focusDay}
            onSelectDay={day => setFocusDay(cur => (cur === day ? null : day))}
          />
        </div>

        <div>
          <SometimesShelf routines={model.sometimes} matches={matches} onOpenRoutine={openRoutine} />
        </div>
      </div>

      <TendDrawer
        open={tendOpen}
        onClose={() => setTendOpen(false)}
        findings={findings}
        routines={routines}
        sleepers={model.seasonal}
        onDismiss={dismissTend}
        onMerge={handleMerge}
        onStampDomain={(id, context) => onUpdateRoutine(id, { context })}
        onRename={(id, name) => onUpdateRoutine(id, { name })}
        onLetGo={id => onDelete?.(id)}
        onWakeAll={handleWakeAll}
        onOpenRoutine={r => { setTendOpen(false); openRoutine(r) }}
      />

      {/* Panel overlay — routine/step editors, shared across all zones */}
      {(openRoutineItem || openStep) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(null)}>
          <div onClick={e => e.stopPropagation()}>
            {openRoutineItem && (
              <TapRoutinePanel
                key={openRoutineItem.id}
                routine={openRoutineItem}
                familyMembers={familyMembers}
                onClose={() => setOpen(null)}
                onRename={name => onUpdateRoutine(openRoutineItem.id, { name })}
                onContextChange={context => onUpdateRoutine(openRoutineItem.id, { context: context ?? null })}
                onVisibilityChange={visibility => onUpdateRoutine(openRoutineItem.id, { visibility })}
                onRestUntilChange={pausedUntil => onUpdateRoutine(openRoutineItem.id, { paused_until: pausedUntil })}
                onAssignChange={memberIds => onUpdateRoutine(openRoutineItem.id, { assigned_to_all: memberIds })}
                onScheduleChange={(pattern, timeOfDay) =>
                  onUpdateRoutine(openRoutineItem.id, { recurrence_pattern: pattern, time_of_day: timeOfDay || null })}
                onNotesChange={description => onUpdateRoutine(openRoutineItem.id, { description })}
                onDelete={onDelete ? () => { onDelete(openRoutineItem.id); setOpen(null) } : undefined}
                onAddSteps={props.onAddSteps ? steps => props.onAddSteps!(openRoutineItem.id, steps) : undefined}
                {...(openWithSteps ? {
                  steps: openRoutineItem.steps,
                  onSelectStep: (s: Routine) => setOpen({ kind: 'step', id: s.id }),
                  onAddStep: (name: string) => props.onAddStep(openRoutineItem.id, name),
                  onReorderSteps: props.onReorderSteps,
                } : {})}
                {...(!openWithSteps && onAddToCollection ? {
                  moveTargets: foldTargets.filter(t => t.id !== openRoutineItem.id),
                  onMoveInto: (targetId: string) => {
                    onAddToCollection(targetId, [openRoutineItem.id])
                    setOpen({ kind: 'routine', id: targetId })
                  },
                } : {})}
              />
            )}
            {openStep && parentOfOpenStep && (
              <TapStepPanel
                key={openStep.id}
                step={openStep}
                parentName={parentOfOpenStep.name}
                onClose={() => setOpen({ kind: 'routine', id: parentOfOpenStep.id })}
                onRename={name => onUpdateRoutine(openStep.id, { name })}
                onDosesChange={times => onUpdateRoutine(openStep.id, { times_per_day: times })}
                onTimeChange={timeOfDay => onUpdateRoutine(openStep.id, { time_of_day: timeOfDay })}
                onNotesChange={description => onUpdateRoutine(openStep.id, { description })}
                onScheduleChange={pattern => onUpdateRoutine(openStep.id, { recurrence_pattern: pattern })}
                onPromote={() => { props.onPromoteStep(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) }}
                onDelete={props.onDeleteStep ? () => { props.onDeleteStep!(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) } : undefined}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
