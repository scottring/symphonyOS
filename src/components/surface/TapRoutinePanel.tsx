import { useState, useEffect, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { Routine, RoutineVisibility, RecurrencePattern } from '@/types/routine'
import type { TargetUnit } from '@/types/actionable'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { PanelShell } from './PanelShell'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMedia } from './sections/PanelMedia'
import { PanelNotes } from './sections/PanelNotes'
import { PanelLocation } from './sections/PanelLocation'
import { PanelFooter } from './sections/PanelFooter'
import { TargetSection } from './sections/TargetSection'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { RoutineScheduleEditor } from '@/components/routine/RoutineScheduleEditor'
import { namesDueDays, routineSwitches } from '@/lib/routineUtils'
import { explainRoutine, formatWake, wakeDate, ROUTINE_HIDE_LABELS, type ExplainCtx } from '@/lib/routines/explain'
import { WhereItShows } from '@/components/routine/WhereItShows'
import { useRoutineExplainLens } from '@/components/routine/useRoutineExplainLens'
import { useHideForToday, useSkippedOn } from '@/components/routine/useHideForToday'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { RoutineStepsSection } from './sections/RoutineStepsSection'
import { PanelAttachments } from './sections/PanelAttachments'
import { ExtractSteps } from '@/components/routine/ExtractSteps'
import { ConceptIcon } from '@/lib/conceptIcons'
import { AssistDrawer } from '@/components/assist/AssistDrawer'
import { useThreadUnread } from '@/hooks/useThreadUnread'
import { useAttachments } from '@/hooks/useAttachments'
import { useRoutineStepChecklist } from '@/hooks/useRoutineStepChecklist'
import { scheduleReadback } from '@/lib/routineReadback'

/** The rule in words plus the next day it comes up ("Monthly, first weekend
 *  (either day) · next: Sat–Sun, Nov 7–8") — the old summary printed the raw
 *  type ("quarterly"), which is how a wrong rule went unnoticed. */
function recurrenceSummary(r: Routine): string {
  return scheduleReadback(r.recurrence_pattern, r.time_of_day ? r.time_of_day.slice(0, 5) : null)
}

interface TapRoutinePanelProps {
  routine: Routine
  familyMembers?: FamilyMember[]
  onClose: () => void
  /** An unsaved routine ("New routine"): Save calls this, and closing
   *  without it writes nothing. */
  unsaved?: boolean
  onSave?: () => void
  onRename?: (name: string) => void
  onNotesChange: (next: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  /** Rest (reference) or wake (active). May return false when the write failed. */
  onVisibilityChange: (visibility: RoutineVisibility) => unknown
  /** Persist a wake date for a resting routine (paused_until; null = rest indefinitely). */
  onRestUntilChange?: (pausedUntil: string | null) => unknown
  /** Take the routine off Today (and the week/month grids) without stopping it:
   *  writes show_on_timeline, resolveRoutine's rung 3. Rendered only when
   *  provided, and only while the routine is Active — "off Today" says nothing
   *  about a routine that is resting off everything. */
  onShowOnTodayChange?: (next: boolean) => unknown
  /** The day "Where it shows" and "Hide for today" are about. Defaults to today. */
  viewedDate?: Date
  /** Extra context for the explanation (a Step's parent, a lens override). */
  explainCtx?: Partial<ExplainCtx>
  onAssignChange?: (memberIds: string[]) => void
  /** Persist a recurrence/time-of-day change. time is '' (clear) or 'HH:MM'. */
  onScheduleChange?: (pattern: RecurrencePattern, timeOfDay: string) => void | boolean | Promise<void | boolean>
  /** Set/change the routine's location (enables directions). When omitted, the Location section is hidden. */
  onUpdateLocation?: (location: string, placeId?: string) => void
  onClearLocation?: () => void
  /** Delete the routine entirely. Rendered (with an inline confirm) only when provided. */
  onDelete?: () => void
  /** Batch-create steps with instructions (used by document → steps extraction). */
  onAddSteps?: (steps: { name: string; detail?: string }[]) => Promise<unknown> | void
  /** Optional steps (child routines). When all four are provided, the Steps section is rendered. */
  steps?: Routine[]
  onSelectStep?: (step: Routine) => void
  onAddStep?: (name: string) => void
  onReorderSteps?: (writes: { id: string; step_order: number }[]) => void
  /** Refetch after the planning assistant writes (enables the Help-me-plan action). */
  onAssistMutate?: () => void
  /** Open the Discussion on mount (deep link from the Discussions inbox). */
  autoOpenDiscussion?: boolean
  /** Existing routines this one can be tucked into as a step (standalone routines only). */
  moveTargets?: { id: string; name: string }[]
  onMoveInto?: (targetId: string) => void
  /** Persist a daily quantity target (null clears it). Rendered only when the routine has
   *  zero steps — a target belongs on the atom, never on a collection parent. */
  onTargetChange?: (t: { amount: number; unit: TargetUnit } | null) => void
}

export function TapRoutinePanel(props: TapRoutinePanelProps) {
  const { routine, familyMembers = [] } = props
  const assigneeIds = routine.assigned_to_all && routine.assigned_to_all.length > 0
    ? routine.assigned_to_all
    : (routine.assigned_to ? [routine.assigned_to] : [])
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [scheduleDraft, setScheduleDraft] = useState({ recurrencePattern: routine.recurrence_pattern, timeOfDay: (routine.time_of_day ?? '').slice(0, 5) })
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState(false)
  const saveSchedule = async () => {
    if (savingSchedule) return false
    setSavingSchedule(true); setScheduleError(false)
    try {
      const result = await props.onScheduleChange?.(scheduleDraft.recurrencePattern, scheduleDraft.timeOfDay)
      if (result === false) { setScheduleError(true); return false }
      setEditingSchedule(false)
      return true
    } catch { setScheduleError(true); return false }
    finally { setSavingSchedule(false) }
  }

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showDirections, setShowDirections] = useState(false)
  const [assistOpen, setAssistOpen] = useState(props.autoOpenDiscussion === true)
  useEffect(() => { if (props.autoOpenDiscussion) setAssistOpen(true) }, [props.autoOpenDiscussion])
  const discussionUnread = useThreadUnread('routine', props.routine.id)
  // Two different questions, and they were being answered by one switch: is
  // this routine running at all (Active/Resting), and does a running routine
  // want a row on Today. A bedtime routine everybody knows by heart is still
  // real — it just doesn't need reading back to you (Scott, 2026-09-07).
  const { active: onTimeline, off } = routineSwitches(routine)

  // Where it shows, for the day being viewed — live against the schedule
  // draft while it is open.
  const dayKey = (props.viewedDate ?? new Date()).toDateString()
  const viewedDate = useMemo(() => new Date(dayKey), [dayKey])
  const skipped = useSkippedOn(props.unsaved ? null : routine.id, viewedDate)
  const lens = useRoutineExplainLens()
  const liveRoutine = useMemo<Routine>(() => editingSchedule
    ? { ...routine, recurrence_pattern: scheduleDraft.recurrencePattern, time_of_day: scheduleDraft.timeOfDay ? scheduleDraft.timeOfDay : null }
    : routine, [routine, editingSchedule, scheduleDraft])
  const explanation = useMemo(() => explainRoutine(liveRoutine, {
    date: viewedDate, prefs: lens.prefs, member: lens.member,
    skippedToday: !!skipped, steps: props.steps, familyMembers,
    ...props.explainCtx,
  }), [liveRoutine, viewedDate, lens, skipped, props.steps, familyMembers, props.explainCtx])
  const canHideToday = explanation.today.shows

  // Every write goes through the canvas activity: saving / saved / didn't
  // save, with Undo restoring what was there. The unsaved draft only patches
  // itself, so it writes directly.
  const { run } = useCanvasActivity()
  const { hideForToday, showToday } = useHideForToday()
  const [restDate, setRestDate] = useState('')
  const write = async (fn: () => unknown) => (await fn()) !== false
  const saveRest = (visibility: RoutineVisibility, pausedUntil: string | null) => async () => {
    const a = await write(() => props.onVisibilityChange(visibility))
    if (!a) return false
    if (props.onRestUntilChange) return write(() => props.onRestUntilChange!(pausedUntil))
    return true
  }
  const prior = { visibility: routine.visibility, pausedUntil: routine.paused_until ?? null }
  const restUntil = async (ymd: string | null) => {
    const iso = ymd ? new Date(`${ymd}T00:00:00`).toISOString() : null
    if (props.unsaved) { await saveRest('reference', iso)(); return }
    const wake = ymd ? wakeDate(ymd) : null
    await run(wake ? `Rest "${routine.name}" until ${formatWake(wake)}` : `Rest "${routine.name}"`, saveRest('reference', iso), {
      ids: [routine.id], undo: saveRest(prior.visibility, prior.pausedUntil),
    })
    setRestDate('')
  }
  const wakeNow = async () => {
    if (props.unsaved) { await saveRest('active', null)(); return }
    await run(`Wake "${routine.name}"`, saveRest('active', null), {
      ids: [routine.id], undo: saveRest(prior.visibility, prior.pausedUntil),
    })
  }
  const changeWake = async (ymd: string) => {
    if (!props.onRestUntilChange) return
    const iso = ymd ? new Date(`${ymd}T00:00:00`).toISOString() : null
    if (props.unsaved) { props.onRestUntilChange(iso); return }
    const wake = ymd ? wakeDate(ymd) : null
    await run(wake ? `Wake "${routine.name}" on ${formatWake(wake)}` : `Rest "${routine.name}" with no wake date`,
      () => write(() => props.onRestUntilChange!(iso)),
      { ids: [routine.id], undo: () => write(() => props.onRestUntilChange!(prior.pausedUntil)) })
  }
  const setOff = async (next: boolean) => {
    const fn = props.onShowOnTodayChange
    if (!fn) return
    if (props.unsaved) { fn(!next); return }
    await run(next ? `Turn "${routine.name}" off` : `Show "${routine.name}" in Today and planning`,
      () => write(() => fn(!next)),
      { ids: [routine.id], undo: () => write(() => fn(next)) })
  }

  // Today-completion checklist for the steps — same instance keys as the
  // Today collection row, so checking here updates its progress too.
  const { checkedByStep, toggleStep } = useRoutineStepChecklist(props.steps ?? [])

  // Load source document from the parent project (if any)
  const { getAttachments, getSignedUrl, fetchAttachments } = useAttachments()
  useEffect(() => {
    if (routine.project_id) {
      fetchAttachments('project', routine.project_id)
    }
  }, [routine.project_id, fetchAttachments])
  const projectDoc = routine.project_id ? getAttachments('project', routine.project_id)[0] : undefined

  return (
    <PanelShell
      identity={
      <PanelHeader
        title={routine.name}
        onTitleChange={(name) => props.onRename?.(name)}
        onClose={props.onClose}
      />

      }
      act={
      <section className="flex flex-col gap-3">
        {/* Where it shows, and why — Today, the week, the kiosk. Live while
            the schedule is being edited, so a change says what it will do. */}
        <WhereItShows explanation={explanation} live={editingSchedule || !!props.unsaved} />

        {/* Who does it + context + streak */}
        <div className="flex flex-wrap items-center gap-2">
          {familyMembers.length > 0 && props.onAssignChange && (
            <MultiAssigneeDropdown
              members={familyMembers}
              selectedIds={assigneeIds}
              onSelect={props.onAssignChange}
              size="sm"
            />
          )}
          <ContextPicker value={routine.context ?? undefined} onChange={props.onContextChange} />
          {props.onAssistMutate && (
            <button
              type="button"
              onClick={() => setAssistOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[15px] font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
            >
              <ConceptIcon name="discussion" size={14} decorative /> Discussion
              {discussionUnread && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-label="Unread" />}
            </button>
          )}
        </div>

        {/* Three strengths of "not showing", kept apart so the difference
            is visible: Hide for today (this occurrence), Rest until… (the
            whole routine, everywhere, wakes on a date), Off (keeps running
            and stays on the kiosk; hidden from Today and planning). */}
        <section aria-label="Hide it" className="routine-hide-controls">
          {onTimeline && !props.unsaved && (
            <div className="routine-hide-control">
              <div className="routine-hide-control-text">
                <span className="routine-hide-control-title">{ROUTINE_HIDE_LABELS.today}</span>
                <span className="routine-hide-control-hint">
                  {skipped
                    ? 'Skipped for today only — the routine itself is unchanged.'
                    : canHideToday
                      ? 'Skips today’s occurrence only. Back next time it’s due.'
                      : 'Not on Today today — nothing to hide.'}
                </span>
              </div>
              <button
                type="button"
                className="canvas-chip"
                disabled={!skipped && !canHideToday}
                onClick={() => { void (skipped ? showToday(routine.id, routine.name, viewedDate) : hideForToday(routine.id, routine.name, viewedDate)) }}
              >
                {skipped ? 'Show today again' : ROUTINE_HIDE_LABELS.today}
              </button>
            </div>
          )}

          <div className="routine-hide-control">
            <div className="routine-hide-control-text">
              <span className="routine-hide-control-title">{onTimeline ? ROUTINE_HIDE_LABELS.rest : 'Resting'}</span>
              <span className="routine-hide-control-hint">
                {onTimeline
                  ? 'Pauses it everywhere — Today, the week and the kiosk — and wakes it on the date.'
                  : explanation.wakesOn
                    ? `Asleep everywhere until ${formatWake(explanation.wakesOn)} — it wakes on its own.`
                    : 'Asleep everywhere, with no wake date — parked on the Resting shelf.'}
              </span>
            </div>
            <div className="routine-hide-control-act">
              {(onTimeline || props.onRestUntilChange) && (
                <input
                  type="date"
                  aria-label={onTimeline ? 'Rest until' : 'Wake automatically on'}
                  value={onTimeline ? restDate : (routine.paused_until ? routine.paused_until.slice(0, 10) : '')}
                  onChange={e => {
                    if (onTimeline) { setRestDate(e.target.value); return }
                    void changeWake(e.target.value)
                  }}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
                />
              )}
              {onTimeline ? (
                <button
                  type="button"
                  className="canvas-chip"
                  onClick={() => { void restUntil(restDate || null) }}
                  aria-label={restDate ? `Rest until ${formatWake(wakeDate(restDate)!)}` : 'Rest with no wake date'}
                >
                  {restDate ? 'Rest' : 'Rest, no date'}
                </button>
              ) : (
                <button type="button" className="canvas-chip" onClick={() => { void wakeNow() }}>
                  Wake now
                </button>
              )}
            </div>
          </div>

          {/* Off — a running routine that doesn't need a row read back to
              you. One switch for Today and the planning pages (Scott,
              2026-10-03); it keeps running and stays on the kitchen kiosk. */}
          {onTimeline && props.onShowOnTodayChange && (
            <div className="routine-hide-control">
              <div className="routine-hide-control-text">
                <span className="routine-hide-control-title">
                  {ROUTINE_HIDE_LABELS.off}{off ? ' — hidden from Today and planning' : ''}
                </span>
                <span className="routine-hide-control-hint">
                  {/* Said as it behaves (dayPlan.ts): a time puts it at that time;
                      a rule naming its days puts it on each of them, untimed; a
                      rule that leaves the day open (the weekend window, "since
                      last") is offered on Today to choose. */}
                  {off
                    ? 'Still runs, and still on the kitchen kiosk. Turn Off back off to show it again.'
                    : routine.time_of_day
                      ? 'Takes a row on Today and the week grid at its time.'
                      : namesDueDays(routine.recurrence_pattern)
                        ? 'On Today and the week on each day it’s due — no time needed.'
                        : 'Offered on Today to choose — it has no set day.'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={off}
                aria-label="Off"
                onClick={() => { void setOff(!off) }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  off ? 'bg-primary-600' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    off ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          )}
        </section>

        {/* Schedule (recurrence + time) — collapsed summary, expands to edit */}
        {props.onScheduleChange && (
          <div>
            {editingSchedule ? (
              <div className="rounded-xl border border-neutral-200 p-3">
                <p className="mb-3 text-xs text-neutral-500">Repeating schedule. To change just one day, use Set time in that day’s Shelves.</p>
                <RoutineScheduleEditor
                  size="sm"
                  recurrencePattern={scheduleDraft.recurrencePattern}
                  timeOfDay={scheduleDraft.timeOfDay}
                  onChange={next => { setScheduleDraft(next); if (props.unsaved) void props.onScheduleChange?.(next.recurrencePattern, next.timeOfDay) }}
                />
                <button
                  disabled={savingSchedule}
                  onClick={() => { void saveSchedule() }}
                  className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-700"
                >
                  {savingSchedule ? 'Saving…' : 'Save repeating schedule'}
                </button>
                {scheduleError && <p role="alert" className="mt-2 text-sm text-red-600">Could not save the schedule. Your changes are still here; try again.</p>}
              </div>
            ) : (
              <button
                onClick={() => { setScheduleDraft({ recurrencePattern: routine.recurrence_pattern, timeOfDay: (routine.time_of_day ?? '').slice(0, 5) }); setScheduleError(false); setEditingSchedule(true) }}
                className="flex items-center justify-between gap-3 w-full px-3 py-2 rounded-lg bg-neutral-100 text-left text-[15px] text-neutral-700 hover:bg-neutral-200 transition-colors"
              >
                <span>{recurrenceSummary(routine)}</span>
                <span className="shrink-0 text-xs text-neutral-500">Edit schedule</span>
              </button>
            )}
          </div>
        )}

        {/* A zero-step routine IS the atom — even RhythmPage's always-visible
            "add first step" Steps section counts as zero steps. Once real steps
            exist the target hides; a target belongs on the atom, never a parent. */}
        {props.onTargetChange && (props.steps?.length ?? 0) === 0 && (
          <TargetSection
            amount={routine.target_amount ?? null}
            unit={routine.target_unit ?? null}
            onChange={props.onTargetChange}
          />
        )}
      </section>
      }
      details={
        <>

      {props.steps && props.onSelectStep && props.onAddStep && props.onReorderSteps && (
        <RoutineStepsSection
          steps={props.steps}
          onSelectStep={props.onSelectStep}
          onAddStep={props.onAddStep}
          onReorderSteps={props.onReorderSteps}
          checkedByStep={checkedByStep}
          onToggleStep={(s) => void toggleStep(s)}
        />
      )}

      {props.onUpdateLocation && props.onClearLocation && (
        <section>
          {routine.location && (
            <button
              onClick={() => setShowDirections((v) => !v)}
              aria-expanded={showDirections}
              className="mb-2 px-3 py-1.5 rounded-lg text-[15px] font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
            >
              <ConceptIcon name="location" decorative /> Directions {showDirections ? '▾' : '▸'}
            </button>
          )}
          <PanelLocation
            location={routine.location ?? undefined}
            locationPlaceId={routine.location_place_id ?? undefined}
            title={routine.name}
            showDirections={showDirections}
            onUpdateLocation={props.onUpdateLocation}
            onClearLocation={props.onClearLocation}
          />
        </section>
      )}

      <PanelNotes
        key={routine.id}
        label="Notes"
        notes={routine.description ?? undefined}
        onChange={props.onNotesChange}
      />

      {/* Photos & Files — the PT sheet, exercise photos, any source doc */}
      <PanelAttachments entityType="routine" entityId={routine.id} />

      {/* Attached document → proposed steps (AI proposes, your tap writes) */}
      {props.onAddSteps && (
        <ExtractSteps routine={routine} onAddSteps={props.onAddSteps} />
      )}

      {(routine.image_url || projectDoc) && (
        <section>
          <PanelMedia
            imageUrl={routine.image_url}
            sourceDoc={projectDoc ? {
              fileName: projectDoc.fileName,
              onOpen: async () => {
                const url = await getSignedUrl(projectDoc.storagePath)
                if (url) window.open(url, '_blank', 'noopener')
              },
            } : undefined}
          />
        </section>
      )}

      {/* Fold this routine into an existing one as a step — the interface
          for "these belong together" without creating anything new. */}
      {props.onMoveInto && props.moveTargets && props.moveTargets.length > 0 && (
        <div className="px-1 pb-3 flex items-center gap-2">
          <label htmlFor="move-into" className="text-xs text-neutral-500 whitespace-nowrap">
            Make this a step of
          </label>
          <select
            id="move-into"
            value=""
            onChange={e => { if (e.target.value) props.onMoveInto!(e.target.value) }}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[15px] text-neutral-700"
          >
            <option value="">Choose a routine…</option>
            {props.moveTargets.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {props.onDelete && (
        <div className="px-1 pb-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[15px] text-neutral-600">Delete this routine and its history?</span>
              <button type="button" onClick={props.onDelete}
                className="text-[15px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5">
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="text-[15px] font-medium text-neutral-500 hover:text-neutral-700 px-2 py-1.5">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 text-[15px] font-medium text-neutral-600 hover:text-red-600">
              <Trash2 className="w-4 h-4" /> Delete routine
            </button>
          )}
        </div>
      )}

      {/* Explicit save affordance — edits persist as you make them, but a
          panel with no button reads as "did that stick?" */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-400">
          {props.unsaved ? 'Not saved yet — closing discards it' : editingSchedule ? 'Save to apply the repeating schedule' : 'Other changes save as you edit'}
        </span>
        <button
          type="button"
          disabled={savingSchedule}
          onClick={async () => { if (props.unsaved && props.onSave) { props.onSave(); return }; if (editingSchedule && !(await saveSchedule())) return; props.onClose() }}
          className="rounded-xl bg-[var(--color-primary-500,#3d5a44)] px-4 py-2 text-[15px] font-medium text-white
                     hover:opacity-90 transition-opacity"
        >
          Save & close
        </button>
      </div>

        </>
      }
      footer={
      <PanelFooter
        createdAt={new Date(routine.created_at)}
        updatedAt={new Date(routine.updated_at)}
      />
      }
    >
      {assistOpen && (
        <AssistDrawer
          item={{
            id: routine.id,
            title: routine.name,
            kind: 'routine',
            notes: routine.description ?? null,
          }}
          // A routine already carries the derived scope on its row.
          discuss={{ type: 'routine', id: routine.id, title: routine.name, scope: routine.scope }}
          onClose={() => setAssistOpen(false)}
          onMutate={props.onAssistMutate}
        />
      )}
    </PanelShell>

  )
}
