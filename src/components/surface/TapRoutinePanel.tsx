import { useState, useEffect } from 'react'
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
import { RoutineStepsSection } from './sections/RoutineStepsSection'
import { PanelAttachments } from './sections/PanelAttachments'
import { ExtractSteps } from '@/components/routine/ExtractSteps'
import { ConceptIcon } from '@/lib/conceptIcons'
import { AssistDrawer } from '@/components/assist/AssistDrawer'
import { useAttachments } from '@/hooks/useAttachments'
import { useRoutineStepChecklist } from '@/hooks/useRoutineStepChecklist'

function recurrenceSummary(r: Routine): string {
  const p = r.recurrence_pattern
  const time = r.time_of_day ? ` · ${r.time_of_day.slice(0, 5)}` : ''
  if (p.type === 'weekly' && p.days?.length) return `Weekly · ${p.days.join(', ')}${time}`
  if (p.type === 'daily') return `Daily${time}`
  return `${p.type}${time}`
}

interface TapRoutinePanelProps {
  routine: Routine
  familyMembers?: FamilyMember[]
  onClose: () => void
  onRename?: (name: string) => void
  onNotesChange: (next: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  onVisibilityChange: (visibility: RoutineVisibility) => void
  /** Persist a wake date for a resting routine (paused_until; null = rest indefinitely). */
  onRestUntilChange?: (pausedUntil: string | null) => void
  onAssignChange?: (memberIds: string[]) => void
  /** Persist a recurrence/time-of-day change. time is '' (clear) or 'HH:MM'. */
  onScheduleChange?: (pattern: RecurrencePattern, timeOfDay: string) => void
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
  /** Existing routines this one can be tucked into as a step (standalone routines only). */
  moveTargets?: { id: string; name: string }[]
  onMoveInto?: (targetId: string) => void
  /** Persist a daily quantity target (null clears it). Rendered only for standalone routines
   *  (no Steps section) — a target belongs on the atom, never on a collection parent. */
  onTargetChange?: (t: { amount: number; unit: TargetUnit } | null) => void
}

export function TapRoutinePanel(props: TapRoutinePanelProps) {
  const { routine, familyMembers = [] } = props
  const assigneeIds = routine.assigned_to_all && routine.assigned_to_all.length > 0
    ? routine.assigned_to_all
    : (routine.assigned_to ? [routine.assigned_to] : [])
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showDirections, setShowDirections] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)
  const onTimeline = routine.visibility === 'active'
  // Steps section renders only when all four are provided (see `details` below) — a
  // target belongs on the atom, never on a collection parent, so it's gated the same way.
  const hasStepsSection = !!(props.steps && props.onSelectStep && props.onAddStep && props.onReorderSteps)

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
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
            >
              <ConceptIcon name="ai" size={14} decorative /> Help me plan
            </button>
          )}
        </div>

        {/* Active / Resting — off parks the routine on the Resting shelf
            (visibility "reference"), optionally with an automatic wake date. */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-neutral-700">
              {onTimeline ? 'Active' : 'Resting'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={onTimeline}
              aria-label="Active"
              onClick={() => props.onVisibilityChange(onTimeline ? 'reference' : 'active')}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                onTimeline ? 'bg-primary-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  onTimeline ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {onTimeline
              ? "This routine appears on Today at its scheduled time."
              : "Asleep — off Today and the week, parked on the Resting shelf."}
          </p>
          {!onTimeline && props.onRestUntilChange && (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="wake-date" className="text-xs text-neutral-500">Wake automatically on</label>
              <input
                id="wake-date"
                type="date"
                value={routine.paused_until ? routine.paused_until.slice(0, 10) : ''}
                onChange={e => props.onRestUntilChange!(e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null)}
                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
              />
            </div>
          )}
        </div>

        {/* Schedule (recurrence + time) — collapsed summary, expands to edit */}
        {props.onScheduleChange && (
          <div>
            {editingSchedule ? (
              <div className="rounded-xl border border-neutral-200 p-3">
                <RoutineScheduleEditor
                  size="sm"
                  recurrencePattern={routine.recurrence_pattern}
                  timeOfDay={(routine.time_of_day ?? '').slice(0, 5)}
                  onChange={({ recurrencePattern, timeOfDay }) =>
                    props.onScheduleChange?.(recurrencePattern, timeOfDay)
                  }
                />
                <button
                  onClick={() => setEditingSchedule(false)}
                  className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingSchedule(true)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-neutral-100 text-sm text-neutral-700 hover:bg-neutral-200 transition-colors"
              >
                <span>{recurrenceSummary(routine)}</span>
                <span className="text-xs text-neutral-500">Edit schedule</span>
              </button>
            )}
          </div>
        )}

        {props.onTargetChange && !hasStepsSection && (
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
              className="mb-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
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
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-700"
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
              <span className="text-sm text-neutral-600">Delete this routine and its history?</span>
              <button type="button" onClick={props.onDelete}
                className="text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5">
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="text-sm font-medium text-neutral-500 hover:text-neutral-700 px-2 py-1.5">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-red-600">
              <Trash2 className="w-4 h-4" /> Delete routine
            </button>
          )}
        </div>
      )}

      {/* Explicit save affordance — edits persist as you make them, but a
          panel with no button reads as "did that stick?" */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-400">Changes save as you edit</span>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-xl bg-[var(--color-primary-500,#3d5a44)] px-4 py-2 text-sm font-medium text-white
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
          onClose={() => setAssistOpen(false)}
          onMutate={props.onAssistMutate}
        />
      )}
    </PanelShell>

  )
}
