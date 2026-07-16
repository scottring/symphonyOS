import { useState } from 'react'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { parseRoutine, parsedRoutineToDb, isValidParsedRoutine } from '@/lib/parseRoutine'
import { SemanticRoutine } from './SemanticRoutine'
import { RoutineScheduleEditor } from './RoutineScheduleEditor'
import { PinButton } from '@/components/pins'
import { TiptapEditor } from '@/components/notes/TiptapEditor'
import { PanelAttachments } from '@/components/surface/sections/PanelAttachments'

interface RoutineFormProps {
  routine: Routine
  contacts?: Contact[]
  familyMembers?: FamilyMember[]
  onBack: () => void
  onUpdate: (id: string, input: UpdateRoutineInput) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onToggleVisibility: (id: string) => Promise<boolean>
  // Pin props
  isPinned?: boolean
  canPin?: boolean
  onPin?: () => Promise<boolean>
  onUnpin?: () => Promise<boolean>
}

export function RoutineForm({ routine, contacts = [], familyMembers = [], onBack, onUpdate, onDelete, onToggleVisibility, isPinned, canPin, onPin, onUnpin }: RoutineFormProps) {
  // Determine if this is a NL routine
  const isNLRoutine = !!routine.raw_input

  // State for NL mode
  const [nlInput, setNlInput] = useState(routine.raw_input || '')

  // State for legacy mode
  const [name, setName] = useState(routine.name)
  const [description, setDescription] = useState(routine.description || '')
  // Recurrence + time of day are managed by the shared RoutineScheduleEditor;
  // we keep the whole pattern + time as state and build the update from them.
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>(routine.recurrence_pattern)
  const [timeOfDay, setTimeOfDay] = useState((routine.time_of_day || '').slice(0, 5))
  const recurrenceType = recurrencePattern.type
  const selectedDays = recurrencePattern.days || []

  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Parse NL input for live preview
  const parsed = isNLRoutine ? parseRoutine(nlInput, contacts) : null
  const nlIsValid = parsed ? isValidParsedRoutine(parsed) : false

  const hasChanges = () => {
    if (isNLRoutine) {
      return nlInput !== routine.raw_input
    }
    if (name !== routine.name) return true

    // Normalize empty description - TiptapEditor may return '<p></p>' for empty content
    const normalizeEmpty = (str: string) => {
      const trimmed = str.trim()
      return trimmed === '' || trimmed === '<p></p>' ? '' : trimmed
    }
    if (normalizeEmpty(description) !== normalizeEmpty(routine.description || '')) return true

    if (timeOfDay !== (routine.time_of_day || '').slice(0, 5)) return true
    // Recurrence pattern: compare structurally (order-independent for days)
    const orig = routine.recurrence_pattern
    if (recurrenceType !== orig.type) return true
    if (recurrenceType === 'weekly') {
      const originalDays = orig.days || []
      if (selectedDays.length !== originalDays.length) return true
      if (!selectedDays.every(d => originalDays.includes(d))) return true
      if ((recurrencePattern.interval || 1) !== (orig.interval || 1)) return true
      if ((recurrencePattern.interval || 1) > 1 && (recurrencePattern.start_date || '') !== (orig.start_date || '')) return true
    }
    if (recurrenceType === 'monthly') {
      if ((recurrencePattern.day_of_month || 1) !== (orig.day_of_month || 1)) return true
    }
    if (recurrenceType === 'since_last') {
      const originalInterval = orig.type === 'since_last' ? (orig.interval || 1) : 1
      const originalUnit = orig.type === 'since_last' ? (orig.unit || 'weeks') : 'weeks'
      if ((recurrencePattern.interval || 1) !== originalInterval) return true
      if ((recurrencePattern.unit || 'weeks') !== originalUnit) return true
    }
    return false
  }

  const handleSave = async () => {
    if (isNLRoutine) {
      if (!nlIsValid || !parsed) return

      setIsSaving(true)
      const dbData = parsedRoutineToDb(parsed)
      await onUpdate(routine.id, {
        name: dbData.name,
        recurrence_pattern: dbData.recurrence_pattern as UpdateRoutineInput['recurrence_pattern'],
        time_of_day: dbData.time_of_day ?? null,
        default_assignee: dbData.default_assignee ?? null,
        raw_input: dbData.raw_input,
      })
      setIsSaving(false)
    } else {
      if (!name.trim()) return

      setIsSaving(true)
      await onUpdate(routine.id, {
        name: name.trim(),
        description: description.trim() || null,
        recurrence_pattern: recurrencePattern,
        time_of_day: timeOfDay || null,
      })
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    await onDelete(routine.id)
    onBack()
  }

  const handleToggleVisibility = async () => {
    await onToggleVisibility(routine.id)
  }

  const isActive = routine.visibility === 'active'

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-neutral-800 flex-1">Edit Routine</h1>
          {/* Pin button */}
          {onPin && onUnpin && (
            <PinButton
              entityType="routine"
              entityId={routine.id}
              isPinned={isPinned ?? false}
              canPin={canPin ?? true}
              onPin={onPin}
              onUnpin={onUnpin}
              size="md"
            />
          )}
          {/* Visibility toggle */}
          <button
            onClick={handleToggleVisibility}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {isActive ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Active
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Paused
              </>
            )}
          </button>
        </div>

        {/* Form - NL mode vs Legacy mode */}
        <div className="space-y-6">
          {isNLRoutine ? (
            /* Natural Language Mode */
            <>
              <div>
                <input
                  type="text"
                  value={nlInput}
                  onChange={(e) => setNlInput(e.target.value)}
                  placeholder="iris walks jax every weekday at 7am"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                             text-neutral-800 placeholder:text-neutral-400 text-2xl font-display
                             focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* Live Preview */}
              {nlInput.trim() && parsed && (
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                  <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                    Preview
                  </div>
                  {nlIsValid ? (
                    <SemanticRoutine tokens={parsed.tokens} size="md" />
                  ) : (
                    <p className="text-neutral-500 text-sm">
                      Type a routine like "walk the dog every morning at 7am"
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Legacy Form Mode */
            <>
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Routine name"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white
                             text-neutral-800 placeholder:text-neutral-400
                             focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Description <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <TiptapEditor
                  content={description}
                  onChange={setDescription}
                  placeholder="Add notes about this routine..."
                />
              </div>

              {/* Recurrence + time of day (shared editor) */}
              <RoutineScheduleEditor
                recurrencePattern={recurrencePattern}
                timeOfDay={timeOfDay}
                onChange={({ recurrencePattern: next, timeOfDay: nextTime }) => {
                  setRecurrencePattern(next)
                  setTimeOfDay(nextTime)
                }}
              />
            </>
          )}

          {/* Timeline visibility toggle */}
          <div className="pt-4 border-t border-neutral-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={routine.show_on_timeline !== false}
                onChange={(e) => onUpdate(routine.id, { show_on_timeline: e.target.checked })}
                className="w-5 h-5 rounded border-neutral-300 text-amber-500 focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700">Show on Today timeline</span>
                <p className="text-xs text-neutral-500">
                  Turn off for muscle-memory routines that don't need tracking
                </p>
              </div>
            </label>
          </div>

          {/* Assignment — multi-select; tap avatars to toggle assignees */}
          {familyMembers.length > 0 && (() => {
            const selectedIds = routine.assigned_to_all && routine.assigned_to_all.length > 0
              ? routine.assigned_to_all
              : (routine.assigned_to ? [routine.assigned_to] : [])

            const writeAssignees = (memberIds: string[]) => {
              onUpdate(routine.id, {
                assigned_to_all: memberIds.length > 0 ? memberIds : null,
                assigned_to: memberIds[0] ?? null,
              })
            }

            const toggleMember = (id: string) => {
              const next = selectedIds.includes(id)
                ? selectedIds.filter((m) => m !== id)
                : [...selectedIds, id]
              writeAssignees(next)
            }

            return (
              <div className="pt-4 border-t border-neutral-100">
                <label className="block text-sm font-medium text-neutral-700 mb-3">
                  Assigned to
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Unassigned option — clears all assignees */}
                  <button
                    type="button"
                    onClick={() => writeAssignees([])}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      selectedIds.length === 0
                        ? 'ring-2 ring-offset-2 ring-amber-500 bg-neutral-100 text-neutral-500'
                        : 'bg-neutral-50 text-neutral-300 hover:bg-neutral-100'
                    }`}
                    title="Unassigned"
                    aria-label="Unassigned"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Family member avatars — tap to toggle */}
                  {familyMembers.map((member) => {
                    const isSelected = selectedIds.includes(member.id)
                    const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleMember(member.id)}
                        aria-pressed={isSelected}
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                          colors.bg
                        } ${colors.text} ${
                          isSelected
                            ? `ring-2 ring-offset-2 ring-amber-500`
                            : 'hover:ring-2 hover:ring-offset-1 ' + colors.ring
                        }`}
                        title={member.name}
                        aria-label={`Assign to ${member.name}`}
                      >
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          member.initials
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                  Tap to add or remove. Multiple people can share a routine.
                </p>
              </div>
            )
          })()}

          {/* Save button */}
          {hasChanges() && (
            <button
              onClick={handleSave}
              disabled={
                isSaving ||
                (isNLRoutine ? !nlIsValid : (!name.trim() || (recurrenceType === 'weekly' && selectedDays.length === 0)))
              }
              className="w-full py-3 rounded-xl bg-amber-500 text-white font-medium
                         hover:bg-amber-600 active:bg-amber-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          )}

          {/* Photos & Files — the PT sheet, exercise photos, any source doc */}
          <div className="pt-6 border-t border-neutral-200">
            <PanelAttachments entityType="routine" entityId={routine.id} />
          </div>

          {/* Danger zone */}
          <div className="pt-6 border-t border-neutral-200">
            <h3 className="text-sm font-medium text-neutral-500 mb-3">Danger Zone</h3>
            {showDeleteConfirm ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 px-4 rounded-lg border border-neutral-200 text-neutral-600 font-medium
                             hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 px-4 rounded-lg bg-red-500 text-white font-medium
                             hover:bg-red-600 transition-colors"
                >
                  Yes, Delete
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 px-4 rounded-lg border border-red-200 text-red-600 font-medium
                           hover:bg-red-50 transition-colors"
              >
                Delete Routine
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
