import { useState, useEffect } from 'react'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'

interface RoutineFormProps {
  routine: Routine
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

export function RoutineForm({ routine, onBack, onUpdate, onDelete, onToggleVisibility }: RoutineFormProps) {
  const [name, setName] = useState(routine.name)
  const [description, setDescription] = useState(routine.description || '')
  const [recurrenceType, setRecurrenceType] = useState<RecurrencePattern['type']>(routine.recurrence_pattern.type)
  const [selectedDays, setSelectedDays] = useState<string[]>(routine.recurrence_pattern.days || [])
  const [timeOfDay, setTimeOfDay] = useState(routine.time_of_day || '')
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Reset form when routine changes
  useEffect(() => {
    setName(routine.name)
    setDescription(routine.description || '')
    setRecurrenceType(routine.recurrence_pattern.type)
    setSelectedDays(routine.recurrence_pattern.days || [])
    setTimeOfDay(routine.time_of_day || '')
  }, [routine])

  const hasChanges = () => {
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

        {/* Form */}
        <div className="space-y-6">
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
            <div className="flex gap-2">
              {(['daily', 'weekly'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRecurrenceType(type)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    recurrenceType === type
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
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

          {/* Save button */}
          {hasChanges() && (
            <button
              onClick={handleSave}
              disabled={!name.trim() || isSaving || (recurrenceType === 'weekly' && selectedDays.length === 0)}
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
