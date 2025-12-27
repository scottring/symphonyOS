import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import { X } from 'lucide-react'

interface PauseRoutineModalProps {
  routine: Routine
  allRoutines: Routine[]
  isOpen: boolean
  onClose: () => void
  onPause: (routineIds: string[], pausedUntil: string | null) => Promise<void>
}

// Duration presets in days
const DURATION_PRESETS = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: 'Indefinitely', days: null },
]

// Find related routines by keyword matching
function findRelatedRoutines(routine: Routine, allRoutines: Routine[]): Routine[] {
  // Extract keywords from routine name (simple word split)
  const keywords = routine.name.toLowerCase().split(/\s+/).filter(word => word.length > 3)

  return allRoutines.filter(r => {
    if (r.id === routine.id) return false // Skip self
    if (r.visibility !== 'active') return false // Only suggest active routines

    const rName = r.name.toLowerCase()

    // Check if any keyword appears in the other routine's name
    return keywords.some(keyword => rName.includes(keyword))
  })
}

export function PauseRoutineModal({ routine, allRoutines, isOpen, onClose, onPause }: PauseRoutineModalProps) {
  const [selectedDuration, setSelectedDuration] = useState<number | null>(7) // Default to 1 week
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set([routine.id]))
  const [isPausing, setIsPausing] = useState(false)

  const relatedRoutines = findRelatedRoutines(routine, allRoutines)

  const handlePause = async () => {
    setIsPausing(true)
    try {
      // Calculate paused_until date
      const pausedUntil = selectedDuration
        ? new Date(Date.now() + selectedDuration * 24 * 60 * 60 * 1000).toISOString()
        : null

      await onPause(Array.from(selectedRoutineIds), pausedUntil)
      onClose()
    } catch (error) {
      console.error('Failed to pause routine:', error)
    } finally {
      setIsPausing(false)
    }
  }

  const toggleRoutine = (routineId: string) => {
    const newSet = new Set(selectedRoutineIds)
    if (newSet.has(routineId)) {
      newSet.delete(routineId)
    } else {
      newSet.add(routineId)
    }
    setSelectedRoutineIds(newSet)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <h2 className="text-xl font-semibold text-neutral-800">Pause Routine</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Duration Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-neutral-700 mb-3">How long?</h3>
            <div className="grid grid-cols-2 gap-2">
              {DURATION_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => setSelectedDuration(preset.days)}
                  className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedDuration === preset.days
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-neutral-200 hover:border-neutral-300 text-neutral-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Routine */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-neutral-700 mb-3">Routine to pause</h3>
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedRoutineIds.has(routine.id)}
                  onChange={() => toggleRoutine(routine.id)}
                  className="w-4 h-4 rounded border-neutral-300 text-amber-500 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-neutral-800">{routine.name}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Related Routines Suggestions */}
          {relatedRoutines.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-neutral-700 mb-3">
                Also pause these related routines?
              </h3>
              <div className="space-y-2">
                {relatedRoutines.map(r => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-white border border-neutral-200 hover:border-amber-200 transition-colors cursor-pointer"
                    onClick={() => toggleRoutine(r.id)}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRoutineIds.has(r.id)}
                        onChange={() => toggleRoutine(r.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-amber-500 focus:ring-amber-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="text-sm text-neutral-800">{r.name}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-neutral-100 bg-neutral-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 font-medium rounded-lg hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePause}
            disabled={isPausing || selectedRoutineIds.size === 0}
            className="px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 active:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPausing ? 'Pausing...' : `Pause ${selectedRoutineIds.size} routine${selectedRoutineIds.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
