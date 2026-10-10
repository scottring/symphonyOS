import { useEffect, useMemo, useRef, useState } from 'react'
import { scopeForDomain } from '@/lib/scope'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { useMobile } from '@/hooks/useMobile'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { EmptyState } from '@/components/layout/EmptyState'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { Plus, Search, Sparkles } from 'lucide-react'
import type { RecurrencePattern, Routine } from '@/types/actionable'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { CreateRoutineInput, UpdateRoutineInput } from '@/hooks/useRoutines'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { TapRoutinePanel } from '@/components/surface/TapRoutinePanel'
import { TapStepPanel } from '@/components/surface/TapStepPanel'
import { buildRhythmModel } from './rhythm/rhythmModel'
import { explainRoutine } from '@/lib/routines/explain'
import { useRoutineExplainLens } from './useRoutineExplainLens'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useDateInstances } from '@/hooks/useDateInstances'
import { deferredInRoutineIds } from '@/lib/today/deferredRoutines'
import { localYmd } from '@/lib/cadence/config'

import { findTend, tendFindingKey } from './rhythm/tendHeuristics'
import { TendDrawer } from './rhythm/TendDrawer'
import { RoutineBoard } from './board/RoutineBoard'
import { NeedsALook } from './board/NeedsALook'
import { ARRANGEMENTS, arrangeBoard, type Arrangement, type BoardRoutine } from './board/boardModel'
import { useRoutineCommands } from './board/useRoutineCommands'
import type { CreateRoutineInSlot } from './rhythm/SlotAdd'

interface RhythmPageProps {
  routines: Routine[]
  /** Hold the empty state until the first load settles. */
  loading?: boolean
  /** Routines exist but the domain filter hides all of them — not "No routines yet". */
  hiddenByFilter?: boolean
  onShowAllDomains?: () => void
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
  /** Create a routine. "New routine" calls it only on Save, with everything
   *  the user set in the unsaved panel. */
  onCreateCollection?: (name: string, fields?: Omit<CreateRoutineInput, 'name'>) => Promise<Routine | null> | void
  /** Fold several routines into a NEW collection. Kept on the contract (the
   *  app passes it) but currently unreachable: its only entry point was naming
   *  a cluster on the daily arc, which the uniform list retired. Tend's
   *  grouping finding is where it belongs next. */
  onGroupIntoCollection?: (
    name: string,
    routineIds: string[],
    opts?: { time_of_day?: string; recurrence_pattern?: RecurrencePattern },
  ) => void
  /** Fold existing routines into an existing routine as its steps. */
  onAddToCollection?: (collectionId: string, routineIds: string[]) => void
  /** Open the AI routine builder (paste text / drop a PDF → proposed routine). */
  onBuildWithAI?: () => void
  /** Create a routine in the slot the user clicked — the slot carries the
   *  recurrence, so no trip through the full form is needed. */
  onCreateRoutineInSlot?: CreateRoutineInSlot
}

export function RhythmPage(props: RhythmPageProps) {
  const isMobile = useMobile()
  const {
    routines, loading = false, familyMembers = [], hiddenByFilter = false, onShowAllDomains,
    onUpdateRoutine, onDelete, onBuildWithAI, onCreateCollection,
    onAddToCollection,
  } = props

  // How the board is arranged. Remembered per browser; a convenience only.
  const [arrangement, setArrangementState] = useState<Arrangement>(() => readPref('routines-arrangement', ['time', 'person', 'where'], 'time'))
  const setArrangement = (a: Arrangement) => { setArrangementState(a); writePref('routines-arrangement', a) }
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<{ kind: 'routine' | 'standalone-step' | 'step'; id: string } | null>(null)
  // "New routine" opens an UNSAVED routine: nothing is written until Save.
  // It used to insert a live "New routine" on click, which showed up on the
  // Daily rung and in the Planning panel while the editor was still open
  // (walkthrough 2026-09-21, B20). Closing without saving writes nothing.
  // The ref mirrors the state so Save reads the latest edit even when a title
  // blur and the Save click land in the same tick.
  const [newDraft, setNewDraftState] = useState<Routine | null>(null)
  const newDraftRef = useRef<Routine | null>(null)
  const setNewDraft = (next: Routine | null) => { newDraftRef.current = next; setNewDraftState(next) }
  const patchDraft = (patch: Partial<Routine>) => {
    if (newDraftRef.current) setNewDraft({ ...newDraftRef.current, ...patch })
  }
  const startNewRoutine = () => {
    if (!onCreateCollection) return
    setOpen(null)
    setNewDraft(makeNewRoutineDraft())
  }
  // Writes the unsaved routine; returns the created row (or null on failure,
  // in which case the panel stays open with the draft intact).
  const saveNewRoutine = async (): Promise<Routine | null> => {
    const d = newDraftRef.current
    if (!d || !onCreateCollection) return null
    const created = await onCreateCollection(d.name, createFieldsFromDraft(d))
    if (!created) return null
    // Two switches CreateRoutineInput doesn't carry ride a follow-up update.
    const extra: UpdateRoutineInput = {}
    if (d.show_on_timeline === false) extra.show_on_timeline = false
    if (d.paused_until) extra.paused_until = d.paused_until
    if (Object.keys(extra).length > 0) await onUpdateRoutine(created.id, extra)
    setNewDraft(null)
    return created
  }
  const [tendOpen, setTendOpen] = useState(false)

  const selfMember = useFamilyMembers().getCurrentUserMember()
  const model = useMemo(() => buildRhythmModel(routines), [routines])
  // Pinned to the day, so "next lands" doesn't recompute on every render and
  // a session left open overnight still rolls when the date changes.
  const today = new Date().toDateString()
  const dayStart = useMemo(() => new Date(today), [today])
  // A sleeper with no wake date is the one that needs a decision — the ribbon
  // used to collect these; Tend still asks about them.
  const sleepers = useMemo(() => model.resting.filter((r) => !r.paused_until), [model.resting])
  const commands = useRoutineCommands({ onUpdateRoutine, onDelete, onAddToCollection })

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
  const { collections } = useMemo(() => groupRoutineSteps(routines), [routines])

  // Where each routine shows today — Today, the week, the kiosk — for the
  // row chips. Today's own lens (areas, people) and today's occurrences, so a
  // routine hidden for today reads as hidden for today.
  const lens = useRoutineExplainLens()
  const { getInstancesForDate } = useActionableInstances()
  const { instances: todayInstances } = useDateInstances(dayStart, getInstancesForDate)
  const explanations = useMemo(() => {
    const instances = todayInstances ?? []
    const skipped = new Set(instances.filter((i) => i.entity_type === 'routine' && i.status === 'skipped' && i.date === localYmd(dayStart)).map((i) => i.entity_id))
    const deferredInto = deferredInRoutineIds(instances, dayStart)
    const stepsOf = new Map(collections.map((c) => [c.id, c.steps]))
    return new Map(routines.filter((r) => !r.parent_routine_id).map((r) => [r.id, explainRoutine(r, {
      date: dayStart, prefs: lens.prefs, member: lens.member, familyMembers,
      skippedToday: skipped.has(r.id), deferredInto, steps: stepsOf.get(r.id),
    })] as const))
  }, [routines, todayInstances, dayStart, collections, lens, familyMembers])

  // The Board: every top-level routine with its Steps and where it shows,
  // arranged into bands (board/boardModel.ts).
  const board = useMemo(() => {
    const stepsOf = new Map(collections.map((c) => [c.id, c.steps]))
    const items: BoardRoutine[] = routines
      .filter((r) => !r.parent_routine_id)
      .map((r) => ({ routine: r, steps: stepsOf.get(r.id) ?? [], explanation: explanations.get(r.id)! }))
      .filter((i) => !!i.explanation)
    return arrangeBoard(items, arrangement, { members: familyMembers, self: selfMember })
  }, [routines, collections, explanations, arrangement, familyMembers, selfMember])
  const restingRoutines = model.resting
  // Type-anywhere search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input,textarea,select,[contenteditable="true"]')) return
      if (open || tendOpen) return
      // A focused control keeps its own keys: Space/Enter activate a button,
      // letters jump in a menu. Search only claims keys from the page itself.
      if (t instanceof HTMLElement && t.closest('button,a,[role]')) return
      if (e.key === ' ') return
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
  const subtitle = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Any active top-level routine can absorb others as steps (an empty shell
  // like a step-less collection counts — folding in gives it its steps).
  const foldTargets = useMemo(
    () => routines
      // Deliberately NOT resolveRoutine. Tend is a management surface: its job
      // is to show RESTING routines so you can wake them, which is the exact
      // opposite of rung 1. Filtering to `visibility === 'active'` here is the
      // seasonal shelf's own rule, not a stale copy of the visibility ladder.
      .filter(r => !r.parent_routine_id && r.visibility === 'active')
      .map(r => ({ id: r.id, name: r.name })),
    [routines],
  )
  const handleWake = (id: string) =>
    onUpdateRoutine(id, { visibility: 'active', paused_until: null })
  const handleWakeAll = () => {
    for (const r of sleepers) handleWake(r.id)
  }
  // Merging deletes the look-alikes outright (their data does not move to the
  // survivor), so it asks first rather than acting on one tap.
  const handleMerge = (_survivorId: string, loserIds: string[]) => {
    const names = loserIds.map(id => routines.find(r => r.id === id)?.name).filter(Boolean)
    const what = names.length === 1 ? `"${names[0]}"` : `${loserIds.length} look-alike routines`
    if (!window.confirm(`Merge by deleting ${what}? Their history and notes are not moved.`)) return
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
  const openStep = open?.kind === 'step' ? cs.flatMap(c => c.steps).find(s => s.id === open.id) : undefined
  const parentOfOpenStep = openStep ? cs.find(c => c.steps.some(s => s.id === openStep.id)) : undefined

  const openRoutine = (r: Routine) =>
    setOpen({ kind: model.stepCounts[r.id] ? 'routine' : 'standalone-step', id: r.id })

  const closePanel = () => {
    setNewDraft(null)
    setOpen(null)
  }
  const updateRoutine = (id: string, patch: Parameters<typeof onUpdateRoutine>[1]) =>
    onUpdateRoutine(id, patch)
  // Escape mirrors the open panel's own close: a step panel returns to its
  // routine, a routine panel closes.
  useEscapeKey(!!open || !!newDraft, openStep && parentOfOpenStep
    ? () => setOpen({ kind: 'routine', id: parentOfOpenStep.id })
    : closePanel)

  const empty = !loading && routines.length === 0
  const segmented = (label: string, options: { id: string; label: string }[], value: string, onPick: (id: string) => void) => (
    <div role="group" aria-label={label} className="routine-segmented">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onPick(o.id)}>{o.label}</button>
      ))}
    </div>
  )

  return (
    // No page background of its own: the place's painted scenery is the page.
    <div className="h-full overflow-auto">
      {/* A board you work on, so it takes the planning frame's width: three
          columns of bands and "Needs a look" beside them. */}
      <div className={`relative ${PAGE_PLANNING}`}>
        {/* The shared masthead card — the same anchor every other page wears. */}
        <MastheadCard
          variant="page"
          // The same eyebrow line every destination has (here a plain label,
          // no period to step), so the title sits at one height everywhere.
          eyebrow={<span className="inline-flex h-7 items-center px-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Everyday</span>}
          title="Routines"
          motif="routines"
          subline={`How your household runs — ${subtitle}`}
          // Same shape as every destination: modes and the primary action at
          // the right; finding and building along the foot.
          controls={isMobile ? undefined :
          <div className="routine-header-controls">
            {segmented('Arrange routines', ARRANGEMENTS, arrangement, (id) => setArrangement(id as Arrangement))}
            <button
              type="button"
              onClick={startNewRoutine}
              className="flex items-center gap-2 rounded-md bg-primary-700 px-4 py-2.5 text-[14px] font-medium text-white
                         transition-colors hover:bg-primary-800 active:bg-primary-900">
              <Plus className="w-5 h-5" />
              New routine
            </button>
          </div>
          }
          footer={
          <div className="routine-header-tools">
            {isMobile && segmented('Arrange routines', ARRANGEMENTS, arrangement, (id) => setArrangement(id as Arrangement))}
            {isMobile && (
              <button type="button" onClick={startNewRoutine}
                className="flex items-center gap-2 rounded-md bg-primary-700 px-4 py-2.5 text-[14px] font-medium text-white">
                <Plus className="w-5 h-5" /> New routine
              </button>
            )}
            <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-md border border-neutral-300 bg-bg-elevated px-3 py-2 focus-within:border-primary-500 md:flex-none">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Find a routine"
                placeholder="Type anywhere to find"
                className="w-full min-w-0 bg-transparent text-[16px] md:w-40 md:text-[14px] focus:outline-none placeholder:text-neutral-400"
              />
            </div>
            {onBuildWithAI && (
              <button type="button" onClick={onBuildWithAI}
                className="flex items-center gap-2 rounded-md border border-neutral-300 bg-bg-elevated px-4 py-2.5
                           text-[14px] font-medium text-neutral-700 transition-colors hover:border-primary-400">
                <Sparkles className="w-4 h-4 text-accent-500" />
                Build with Symphony
              </button>
            )}
          </div>
          }
        />

        {loading && routines.length === 0 && (
          <EmptyState title="Loading your routines…" />
        )}

        {empty && hiddenByFilter && (
          <EmptyState
            title="No routines in the areas you're viewing"
            action={onShowAllDomains ? (
              <button
                type="button"
                onClick={onShowAllDomains}
                className="rounded-md px-3 py-2 text-[14px] text-primary-700 transition-colors hover:bg-primary-50"
              >
                Show all domains
              </button>
            ) : undefined}
          >
            Your other routines are hidden by the domain filter.
          </EmptyState>
        )}

        {/* An empty account is one calm card — never a stack of empty bands. */}
        {empty && !hiddenByFilter && (
          <section aria-label="No routines yet" className="canvas-group routine-empty">
            <h2 className="routine-empty-title">No routines yet</h2>
            <p className="routine-empty-text">A routine is something your household does again and again — mornings, bedtime, the weekly reset. Make one, or tell Symphony how your days run.</p>
            <div className="routine-empty-actions">
              <button type="button" onClick={startNewRoutine}
                className="flex items-center gap-2 rounded-md bg-primary-700 px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-800">
                <Plus className="w-4 h-4" /> New routine
              </button>
              {onBuildWithAI && (
                <button type="button" onClick={onBuildWithAI}
                  className="flex items-center gap-2 rounded-md border border-neutral-300 bg-bg-elevated px-4 py-2.5 text-[14px] font-medium text-neutral-700 transition-colors hover:border-primary-400">
                  <Sparkles className="w-4 h-4 text-accent-500" /> Build with Symphony
                </button>
              )}
            </div>
          </section>
        )}

        {routines.length > 0 && (
          <div className="routine-board">
            <NeedsALook
              findings={findings}
              routines={routines}
              resting={restingRoutines}
              onMerge={handleMerge}
              onDismiss={dismissTend}
              onStampDomain={(id, context) => onUpdateRoutine(id, { context })}
              onRename={(id, name) => onUpdateRoutine(id, { name })}
              onLetGo={id => onDelete?.(id)}
              onWake={(r) => { void commands.wake(r) }}
              onOpenRoutine={openRoutine}
              onSeeAll={() => setTendOpen(true)}
            />
            <div className="routine-board-main">
              <RoutineBoard
                  model={board}
                  familyMembers={familyMembers}
                  matches={matches}
                  today={dayStart}
                  commands={commands}
                  canDelete={!!onDelete}
                  onOpen={openRoutine}
                  onOpenStep={(s) => setOpen({ kind: 'step', id: s.id })}
                  onDropRoutine={onAddToCollection ? (draggedId, target) => {
                    const dragged = routines.find((r) => r.id === draggedId)
                    if (dragged) void commands.group(dragged, target)
                  } : undefined}
                />
            </div>
          </div>
        )}
      </div>

      <TendDrawer
        open={tendOpen}
        onClose={() => setTendOpen(false)}
        findings={findings}
        routines={routines}
        sleepers={sleepers}
        onDismiss={dismissTend}
        onMerge={handleMerge}
        onStampDomain={(id, context) => onUpdateRoutine(id, { context })}
        onRename={(id, name) => onUpdateRoutine(id, { name })}
        onLetGo={id => onDelete?.(id)}
        onWakeAll={handleWakeAll}
        onOpenRoutine={r => { setTendOpen(false); openRoutine(r) }}
      />

      {/* Panel overlay — routine/step editors, shared across all zones.
          The routine panel can run taller than the viewport (many steps, a
          long description) — without a capped, scrolling wrapper here it
          used to render past the fold with no way to reach its Delete/Done
          footer (demo run 2026-09-06). TapRoutinePanel/TapStepPanel share one
          PanelShell across every panel type in the app, so the cap lives on
          this wrapper rather than splitting PanelShell into sticky
          header/body/footer regions. */}
      {(openRoutineItem || openStep || newDraft) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closePanel}>
          <div
            data-testid="routine-panel-dialog"
            onClick={e => e.stopPropagation()}
            className="flex max-h-[calc(100vh-2rem)] flex-col"
          >
            <div data-testid="routine-panel-body" className="min-h-0 flex-1 overflow-y-auto">
            {newDraft && (
              <TapRoutinePanel
                key="new-routine"
                routine={newDraft}
                familyMembers={familyMembers}
                unsaved
                onClose={closePanel}
                onSave={() => { void saveNewRoutine() }}
                onRename={name => patchDraft({ name })}
                onContextChange={context => patchDraft({ context: context ?? null })}
                onVisibilityChange={visibility => patchDraft({ visibility })}
                onRestUntilChange={pausedUntil => patchDraft({ paused_until: pausedUntil })}
                onShowOnTodayChange={next => patchDraft({ show_on_timeline: next })}
                onAssignChange={memberIds => patchDraft({ assigned_to_all: memberIds })}
                onScheduleChange={(pattern, timeOfDay) =>
                  patchDraft({ recurrence_pattern: pattern, time_of_day: timeOfDay || null })}
                onNotesChange={description => patchDraft({ description })}
                onTargetChange={t => patchDraft({ target_amount: t?.amount ?? null, target_unit: t?.unit ?? null })}
                steps={[]}
                onSelectStep={() => {}}
                // A first step is a deliberate edit: save the routine, then
                // add the step to the real row and keep its panel open.
                onAddStep={async (name: string) => {
                  const created = await saveNewRoutine()
                  if (!created) return
                  props.onAddStep(created.id, name)
                  setOpen({ kind: 'routine', id: created.id })
                }}
                onReorderSteps={props.onReorderSteps}
              />
            )}
            {!newDraft && openRoutineItem && (
              <TapRoutinePanel
                key={openRoutineItem.id}
                routine={openRoutineItem}
                familyMembers={familyMembers}
                onClose={closePanel}
                onRename={name => updateRoutine(openRoutineItem.id, { name })}
                onContextChange={context => updateRoutine(openRoutineItem.id, { context: context ?? null })}
                onVisibilityChange={visibility => updateRoutine(openRoutineItem.id, { visibility })}
                onRestUntilChange={pausedUntil => updateRoutine(openRoutineItem.id, { paused_until: pausedUntil })}
                onShowOnTodayChange={next => updateRoutine(openRoutineItem.id, { show_on_timeline: next })}
                onAssignChange={memberIds => updateRoutine(openRoutineItem.id, { assigned_to_all: memberIds })}
                onScheduleChange={(pattern, timeOfDay) =>
                  updateRoutine(openRoutineItem.id, { recurrence_pattern: pattern, time_of_day: timeOfDay || null })}
                onNotesChange={description => updateRoutine(openRoutineItem.id, { description })}
                onTargetChange={t => updateRoutine(openRoutineItem.id, { target_amount: t?.amount ?? null, target_unit: t?.unit ?? null })}
                onDelete={onDelete ? () => { onDelete(openRoutineItem.id); setOpen(null) } : undefined}
                onAddSteps={props.onAddSteps ? steps => props.onAddSteps!(openRoutineItem.id, steps) : undefined}
                steps={openRoutineItem.steps}
                onSelectStep={(s: Routine) => setOpen({ kind: 'step', id: s.id })}
                onAddStep={(name: string) => props.onAddStep(openRoutineItem.id, name)}
                onReorderSteps={props.onReorderSteps}
                {...(openRoutineItem.steps.length === 0 && onAddToCollection ? {
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
                parent={parentOfOpenStep}
                onClose={() => setOpen({ kind: 'routine', id: parentOfOpenStep.id })}
                onRename={name => onUpdateRoutine(openStep.id, { name })}
                onDosesChange={times => onUpdateRoutine(openStep.id, { times_per_day: times })}
                onTimeChange={timeOfDay => onUpdateRoutine(openStep.id, { time_of_day: timeOfDay })}
                onNotesChange={description => onUpdateRoutine(openStep.id, { description })}
                onScheduleChange={pattern => onUpdateRoutine(openStep.id, { recurrence_pattern: pattern })}
                onTargetChange={t => onUpdateRoutine(openStep.id, { target_amount: t?.amount ?? null, target_unit: t?.unit ?? null })}
                onPromote={() => { props.onPromoteStep(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) }}
                onDelete={props.onDeleteStep ? () => { props.onDeleteStep!(openStep.id); setOpen({ kind: 'routine', id: parentOfOpenStep.id }) } : undefined}
              />
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const NEW_ROUTINE_DRAFT_ID = 'new-routine-draft'

/** The unsaved routine "New routine" opens — the same defaults addRoutine writes. */
function makeNewRoutineDraft(): Routine {
  const now = new Date().toISOString()
  return {
    id: NEW_ROUTINE_DRAFT_ID, user_id: '', name: 'New routine', description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    // Display only — the real scope is derived again on insert.
    scope: scopeForDomain(null, null, null),
    created_at: now, updated_at: now,
  }
}

function createFieldsFromDraft(d: Routine): Omit<CreateRoutineInput, 'name'> {
  return {
    description: d.description ?? undefined,
    recurrence_pattern: d.recurrence_pattern,
    time_of_day: d.time_of_day ?? undefined,
    visibility: d.visibility,
    assigned_to_all: d.assigned_to_all && d.assigned_to_all.length > 0 ? d.assigned_to_all : undefined,
    // Unset means "the app decides" (the active domain lens), not Unsorted.
    context: d.context ?? undefined,
    target_amount: d.target_amount ?? null,
    target_unit: d.target_unit ?? null,
  }
}

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  } catch { return fallback }
}

function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* a convenience only */ }
}
