import { useEffect, useMemo, useRef, useState } from 'react'
import { scopeForDomain } from '@/lib/scope'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { Plus, Search, Sparkles, RefreshCw, Wrench, ChevronRight, ChevronDown } from 'lucide-react'
import type { RecurrencePattern, Routine } from '@/types/actionable'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import type { CreateRoutineInput, UpdateRoutineInput } from '@/hooks/useRoutines'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { TapRoutinePanel } from '@/components/surface/TapRoutinePanel'
import { TapStepPanel } from '@/components/surface/TapStepPanel'
import { buildRhythmModel } from './rhythm/rhythmModel'

import { findTend, tendFindingKey } from './rhythm/tendHeuristics'
import { CadenceBand } from './rhythm/CadenceBand'
import { TendDrawer } from './rhythm/TendDrawer'
import type { CreateRoutineInSlot } from './rhythm/SlotAdd'

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
  const {
    routines, loading = false, familyMembers = [],
    onUpdateRoutine, onDelete, onBuildWithAI, onCreateCollection,
    onAddToCollection, onCreateRoutineInSlot,
  } = props

  // "Whose week" holds a SET of people; empty is Everyone. One name behaves
  // exactly as the old single lens did (Scott, 2026-09-07).
  const [memberIds, setMemberIds] = useState<string[]>([])
  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  // A focused Through-the-week day: the arc shows that day's full picture.
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
  const [restingOpen, setRestingOpen] = useState(false)
  const [tendOpen, setTendOpen] = useState(false)

  // A slot created while a member lens is locked in shares only with those
  // people — the lens IS the "who" the user just clicked on. One name rides
  // the legacy single column; several ride assigned_to_all, which is what the
  // routine's own Who control writes.
  const createRoutineInSlot = useMemo<CreateRoutineInSlot | undefined>(() => {
    if (!onCreateRoutineInSlot) return undefined
    return (draft) => onCreateRoutineInSlot({
      ...draft,
      assigned_to: memberIds.length === 1 ? memberIds[0] : undefined,
      assigned_to_all: memberIds.length > 1 ? memberIds : undefined,
    })
  }, [onCreateRoutineInSlot, memberIds])

  // "Whose week" narrows by assignee (buildRhythmModel's `keep`), which misses
  // a routine YOU made but never explicitly assigned — under your own lens
  // that unassigned routine should still be yours (demo run 2026-09-06:
  // switching to your own pill hid your own routines). buildRhythmModel's
  // `keep` only reads assigned_to/assigned_to_all, so rather than teach it a
  // second identity (routine.user_id, an auth user id, vs. the family_member
  // id it filters on) we stamp the match onto a copy of the routine list
  // before it ever reaches the model builder.
  const selfMember = useFamilyMembers().getCurrentUserMember()
  const routinesForModel = useMemo(() => {
    const isSelfLens = !!selfMember && memberIds.includes(selfMember.id)
    if (!isSelfLens) return routines
    return routines.map((r) => {
      const hasAssignee = !!r.assigned_to || (r.assigned_to_all && r.assigned_to_all.length > 0)
      if (hasAssignee || r.user_id !== selfMember!.user_id) return r
      return { ...r, assigned_to: selfMember!.id }
    })
  }, [routines, memberIds, selfMember])

  const model = useMemo(
    () => buildRhythmModel(routinesForModel, { memberIds }),
    [routinesForModel, memberIds],
  )
  // Pinned to the day, so "next lands" doesn't recompute on every render and
  // a session left open overnight still rolls when the date changes.
  const today = new Date().toDateString()
  const dayStart = useMemo(() => new Date(today), [today])
  // A sleeper with no wake date is the one that needs a decision — the ribbon
  // used to collect these; Tend still asks about them.
  const sleepers = useMemo(() => model.resting.filter((r) => !r.paused_until), [model.resting])

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

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Full-width canvas (keeps the shared gutter, drops the 940px cap) —
          the staggered timeline needs the room; approved deviation from PAGE_COLUMN. */}
      <div className="relative w-full px-6 md:px-10 lg:px-14 py-8">
        {/* The shared masthead card — the same anchor every other page wears. */}
        <MastheadCard
          variant="page"
          title="Routines"
          motif="routines"
          subline={`How your family runs — ${subtitle}`}
          footer={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-neutral-300 bg-bg-elevated px-3 py-2 focus-within:border-primary-500">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type anywhere to find"
                className="w-40 bg-transparent text-[14px] focus:outline-none placeholder:text-neutral-400"
              />
            </div>
            {onBuildWithAI && (
              <button onClick={onBuildWithAI}
                className="flex items-center gap-2 rounded-md border border-neutral-300 bg-bg-elevated px-4 py-2.5
                           text-[14px] font-medium text-neutral-700 transition-colors hover:border-primary-400">
                <Sparkles className="w-4 h-4 text-accent-500" />
                Build with AI
              </button>
            )}
            <button
              onClick={() => setTendOpen(true)}
              className="relative flex items-center gap-2 rounded-md border border-neutral-300 bg-bg-elevated px-4 py-2.5
                         text-[14px] font-medium text-neutral-700 transition-colors hover:border-primary-400"
            >
              <Wrench className="w-4 h-4 text-primary-600" />
              Tend
              {tendCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {tendCount}
                </span>
              )}
            </button>
            <button
              onClick={startNewRoutine}
              className="flex items-center gap-2 rounded-md bg-primary-700 px-4 py-2.5 text-[14px] font-medium text-white
                         transition-colors hover:bg-primary-800 active:bg-primary-900">
              <Plus className="w-5 h-5" />
              New routine
            </button>
          </div>
          }
        />

        {/* People pills */}
        {familyMembers.length > 0 && (
          <div className="mb-6 flex items-center gap-1.5 flex-wrap">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Whose week</span>
            <button onClick={() => setMemberIds([])} aria-pressed={memberIds.length === 0}
              className={`rounded-full px-3 py-1 text-[14px] transition-colors ${
                memberIds.length === 0 ? 'bg-primary-700 text-white' : 'border border-neutral-300 text-neutral-600'
              }`}>
              Everyone
            </button>
            {[...familyMembers].sort((a, b) => a.display_order - b.display_order).map(m => (
              <button key={m.id} onClick={() => toggleMember(m.id)} aria-pressed={memberIds.includes(m.id)}
                className={`rounded-full px-3 py-1 text-[14px] transition-colors ${
                  memberIds.includes(m.id) ? 'bg-primary-700 text-white' : 'border border-neutral-300 text-neutral-600'
                }`}>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {loading && routines.length === 0 && (
          <p className="py-16 text-center text-[15px] text-neutral-400">Loading your week…</p>
        )}

        {!loading && routines.length === 0 && (
          <div className="py-16 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto mb-5 h-8 w-8 text-primary-400" />
            <h2 className="mb-2 font-display text-[24px] text-neutral-800">No routines yet</h2>
            <p className="mx-auto mb-6 max-w-sm text-[15px] text-neutral-500">
              Capture your first routine and Symphony will start painting your week.
            </p>
            <button
              onClick={startNewRoutine}
              className="inline-flex items-center gap-2 rounded-md bg-primary-700 px-5 py-2.5 text-[15px] font-medium text-white
                         transition-colors hover:bg-primary-800">
              <Plus className="h-5 w-5" />
              Create your first routine
            </button>
          </div>
        )}

        {/* Every rung the same shape — name · when · who · a way in. The arc
            and the day strip drew the top two rungs as bespoke canvases, so
            "every day" and "once a season" looked like different kinds of
            thing, and a Tue/Thu/Sat routine appeared three times (Scott,
            2026-09-13). */}
        <div className="flex max-w-[860px] flex-col gap-7">
          <CadenceBand
            heading="Daily" hint="A little, every day"
            routines={model.daily} familyMembers={familyMembers} stepCounts={model.stepCounts}
            matches={matches} now={dayStart} onOpenRoutine={openRoutine}
            onCreateInSlot={createRoutineInSlot}
            createPattern={{ type: 'daily' }}
            addLabel="Add a daily routine"
          />
          <CadenceBand
            heading="Weekly" hint="With a day, or whenever it fits"
            routines={model.week} familyMembers={familyMembers} stepCounts={model.stepCounts}
            matches={matches} now={dayStart} onOpenRoutine={openRoutine}
            onCreateInSlot={createRoutineInSlot}
            createPattern={{ type: 'weekly' }}
            addLabel="Add a weekly routine"
          />
          <CadenceBand
            heading="Monthly" hint="Once a month"
            routines={model.month} familyMembers={familyMembers} stepCounts={model.stepCounts}
            matches={matches} now={dayStart} onOpenRoutine={openRoutine}
            onCreateInSlot={createRoutineInSlot}
            createPattern={{ type: 'monthly' }}
            addLabel="Add a monthly routine"
          />
          <CadenceBand
            heading="Seasonal" hint="As the season changes"
            routines={model.season} familyMembers={familyMembers} stepCounts={model.stepCounts}
            matches={matches} now={dayStart} onOpenRoutine={openRoutine}
            onCreateInSlot={createRoutineInSlot}
            createPattern={{ type: 'quarterly' }}
            addLabel="Add a seasonal routine"
          />
          <CadenceBand
            heading="Yearly" hint="Once a year, on its date"
            routines={model.year} familyMembers={familyMembers} stepCounts={model.stepCounts}
            matches={matches} now={dayStart} onOpenRoutine={openRoutine}
            onCreateInSlot={createRoutineInSlot}
            createPattern={{ type: 'yearly' }}
            addLabel="Add a yearly routine"
          />
          <CadenceBand
            heading="Less often" hint="Rarer than once a year"
            routines={model.rare} familyMembers={familyMembers} stepCounts={model.stepCounts}
            matches={matches} now={dayStart} onOpenRoutine={openRoutine}
            onCreateInSlot={createRoutineInSlot}
            createPattern={{ type: 'yearly', interval: 2 }}
            addLabel="Add a rarer routine"
          />

          {/* Resting is not a commitment — it waits behind a disclosure rather
              than sitting among the things you actually do. */}
          {model.resting.length > 0 && (
            <div>
              <button
                type="button"
                aria-expanded={restingOpen}
                onClick={() => setRestingOpen(v => !v)}
                className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-700"
              >
                {restingOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Resting routines
                <span className="tabular-nums text-neutral-400">{model.resting.length}</span>
              </button>
              {restingOpen && (
                <div className="mt-2">
                  <CadenceBand
                    heading="Resting" hint="Not a commitment right now — it wakes on its own"
                    routines={model.resting} familyMembers={familyMembers} stepCounts={model.stepCounts}
                    matches={matches} now={dayStart} resting onOpenRoutine={openRoutine}
                  />
                </div>
              )}
            </div>
          )}
        </div>
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
