import { useState, useEffect } from 'react'
import { Flame } from 'lucide-react'
import type { Routine, RoutineVisibility, RecurrencePattern } from '@/types/routine'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMedia } from './sections/PanelMedia'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLocation } from './sections/PanelLocation'
import { PanelFooter } from './sections/PanelFooter'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { RoutineScheduleEditor } from '@/components/routine/RoutineScheduleEditor'
import { RoutineStepsSection } from './sections/RoutineStepsSection'
import { ConceptIcon } from '@/lib/conceptIcons'
import { AssistDrawer } from '@/components/assist/AssistDrawer'
import { useRoutineStats } from '@/hooks/useRoutineStats'
import { useAttachments } from '@/hooks/useAttachments'

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
  onAssignChange?: (memberIds: string[]) => void
  /** Persist a recurrence/time-of-day change. time is '' (clear) or 'HH:MM'. */
  onScheduleChange?: (pattern: RecurrencePattern, timeOfDay: string) => void
  /** Set/change the routine's location (enables directions). When omitted, the Location section is hidden. */
  onUpdateLocation?: (location: string, placeId?: string) => void
  onClearLocation?: () => void
  /** Optional steps (child routines). When all four are provided, the Steps section is rendered. */
  steps?: Routine[]
  onSelectStep?: (step: Routine) => void
  onAddStep?: (name: string) => void
  onReorderSteps?: (writes: { id: string; step_order: number }[]) => void
  /** Refetch after the planning assistant writes (enables the Help-me-plan action). */
  onAssistMutate?: () => void
}

export function TapRoutinePanel(props: TapRoutinePanelProps) {
  const { routine, familyMembers = [] } = props
  const { getStats } = useRoutineStats()
  const streak = getStats(routine.id)?.currentStreak ?? 0
  const assigneeIds = routine.assigned_to_all && routine.assigned_to_all.length > 0
    ? routine.assigned_to_all
    : (routine.assigned_to ? [routine.assigned_to] : [])
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [showDirections, setShowDirections] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)
  const onTimeline = routine.visibility === 'active'

  // Load source document from the parent project (if any)
  const { getAttachments, getSignedUrl, fetchAttachments } = useAttachments()
  useEffect(() => {
    if (routine.project_id) {
      fetchAttachments('project', routine.project_id)
    }
  }, [routine.project_id, fetchAttachments])
  const projectDoc = routine.project_id ? getAttachments('project', routine.project_id)[0] : undefined

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={routine.name}
        onTitleChange={(name) => props.onRename?.(name)}
        onClose={props.onClose}
      />

      <section className="pb-4 mb-4 border-b border-neutral-200 flex flex-col gap-3">
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
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 ml-auto">
              <Flame className="w-4 h-4" />
              {streak}-day streak
            </span>
          )}
        </div>

        {/* Show on Today's timeline — a real on/off switch. Off = "reference":
            the routine is kept but doesn't appear on Today. */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-neutral-700">Show on Today's timeline</span>
            <button
              type="button"
              role="switch"
              aria-checked={onTimeline}
              aria-label="Show on Today's timeline"
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
          <p className="text-xs text-neutral-500 mt-1.5">
            {onTimeline
              ? 'This routine appears on Today at its scheduled time.'
              : 'Reference: the routine is kept but hidden from Today (turn on to schedule it back).'}
          </p>
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
      </section>

      {props.steps && props.onSelectStep && props.onAddStep && props.onReorderSteps && (
        <section className="pb-4 mb-4 border-b border-neutral-200">
          <RoutineStepsSection
            steps={props.steps}
            onSelectStep={props.onSelectStep}
            onAddStep={props.onAddStep}
            onReorderSteps={props.onReorderSteps}
          />
        </section>
      )}

      {props.onUpdateLocation && props.onClearLocation && (
        <section className="pb-4 mb-4 border-b border-neutral-200">
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

      <PanelWhy
        key={routine.id}
        label="Notes"
        notes={routine.description ?? undefined}
        onChange={props.onNotesChange}
      />

      {(routine.image_url || projectDoc) && (
        <section className="pb-4 mb-4 border-b border-neutral-200">
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

      <PanelFooter
        createdAt={new Date(routine.created_at)}
        updatedAt={new Date(routine.updated_at)}
      />
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
    </article>
  )
}
