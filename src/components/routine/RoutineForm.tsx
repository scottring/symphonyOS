import { useState } from 'react'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { parseRoutine, parsedRoutineToDb, isValidParsedRoutine } from '@/lib/parseRoutine'
import { SemanticRoutine } from './SemanticRoutine'

interface RoutineFormProps {
  routine: Routine
  contacts?: Contact[]
  familyMembers?: FamilyMember[]
  onBack: () => void
  onUpdate: (id: string, input: UpdateRoutineInput) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onToggleVisibility: (id: string) => Promise<boolean>
}

const DAYS = [
  { key: 'sun', label: 'Sun' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
]

export function RoutineForm({ routine, contacts = [], familyMembers = [], onBack, onUpdate, onDelete, onToggleVisibility }: RoutineFormProps) {
  // Determine if this is a NL routine
  const isNLRoutine = !!routine.raw_input

  // State for NL mode
  const [nlInput, setNlInput] = useState(routine.raw_input || '')

  // State for legacy mode
  const [name, setName] = useState(routine.name)
  const [description, setDescription] = useState(routine.description || '')
  const [recurrenceType, setRecurrenceType] = useState<RecurrencePattern['type']>(routine.recurrence_pattern.type)
  const [selectedDays, setSelectedDays] = useState<string[]>(routine.recurrence_pattern.days || [])
  const [timeOfDay, setTimeOfDay] = useState(routine.time_of_day || '')

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
    if (description !== (routine.description || '')) return true
    if (recurrenceType !== routine.recurrence_pattern.type) return true
    if (timeOfDay !== (routine.time_of_day || '')) return true
    if (recurrenceType === 'weekly') {
      const originalDays = routine.recurrence_pattern.days || []
      if (selectedDays.length !== originalDays.length) return true
      if (!selectedDays.every(d => originalDays.includes(d))) return true
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
      const recurrence_pattern: RecurrencePattern = { type: recurrenceType }
      if (recurrenceType === 'weekly') {
        recurrence_pattern.days = selectedDays
      }

      await onUpdate(routine.id, {
        name: name.trim(),
        description: description.trim() || null,
        recurrence_pattern,
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

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
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
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes about this routine..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white
                             text-neutral-800 placeholder:text-neutral-400 resize-none
                             focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* Recurrence Type */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Repeats</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'quarterly', label: 'Quarterly' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRecurrenceType(value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        recurrenceType === value
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selector for weekly */}
              {recurrenceType === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">On days</label>
                  <div className="flex gap-2">
                    {DAYS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDay(key)}
                        className={`w-12 h-12 rounded-full text-sm font-medium transition-colors ${
                          selectedDays.includes(key)
                            ? 'bg-amber-500 text-white'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {recurrenceType === 'weekly' && selectedDays.length === 0 && (
                    <p className="text-sm text-red-500 mt-2">Select at least one day</p>
                  )}
                </div>
              )}

              {/* Time of day */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Time <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white
                             text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                {timeOfDay && (
                  <button
                    type="button"
                    onClick={() => setTimeOfDay('')}
                    className="mt-2 text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    Clear time
                  </button>
                )}
              </div>
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

          {/* Assignment */}
          {familyMembers.length > 0 && (
            <div className="pt-4 border-t border-neutral-100">
              <label className="block text-sm font-medium text-neutral-700 mb-3">
                Assigned to
              </label>
              <div className="flex items-center gap-2">
                {/* Unassigned option */}
                <button
                  type="button"
                  onClick={() => onUpdate(routine.id, { assigned_to: null })}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    !routine.assigned_to
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

                {/* Family member avatars */}
                {familyMembers.map((member) => {
                  const isSelected = routine.assigned_to === member.id
                  const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => onUpdate(routine.id, { assigned_to: member.id })}
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
                Who is responsible for this routine by default
              </p>
            </div>
          )}

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
