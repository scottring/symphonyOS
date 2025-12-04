import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'

interface AssignRoutinesProps {
  routines: Routine[]
  familyMembers: FamilyMember[]
  onAssign: (routineId: string, memberId: string | null) => Promise<void>
  onContinue: () => void
  onSkip: () => void
}

function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
    teal: 'bg-teal-500',
  }
  return colorMap[color] || 'bg-neutral-400'
}

function getRecurrenceLabel(pattern: Routine['recurrence_pattern']): string {
  switch (pattern.type) {
    case 'daily':
      return 'Every day'
    case 'weekly':
      if (pattern.days?.length === 5 &&
          pattern.days.every(d => ['mon', 'tue', 'wed', 'thu', 'fri'].includes(d))) {
        return 'Weekdays'
      }
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
    default:
      return ''
  }
}

export function AssignRoutines({
  routines,
  familyMembers,
  onAssign,
  onContinue,
  onSkip,
}: AssignRoutinesProps) {
  const [assignments, setAssignments] = useState<Record<string, string | null>>({})
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const getAssignedMember = (routineId: string): FamilyMember | null => {
    const memberId = assignments[routineId]
    if (!memberId) return null
    return familyMembers.find(m => m.id === memberId) ?? null
  }

  const handleAssign = async (routineId: string, memberId: string | null) => {
    setAssignments(prev => ({ ...prev, [routineId]: memberId }))
    await onAssign(routineId, memberId)
    setOpenDropdown(null)
  }

  if (routines.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <p className="text-neutral-500 mb-8">No routines to assign.</p>
        <button
          onClick={onContinue}
          className="btn-primary px-8 py-3 text-lg font-medium"
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          Who does what?
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-8">
          Tap the avatar to assign each routine.
        </p>

        {/* Routine list */}
        <ul className="space-y-3 mb-8">
          {routines.map((routine) => {
            const assigned = getAssignedMember(routine.id)
            const isOpen = openDropdown === routine.id

            return (
              <li
                key={routine.id}
                className="p-4 bg-white rounded-lg border border-neutral-100"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-neutral-800 font-medium">{routine.name}</div>
                    <div className="text-sm text-neutral-400">
                      {getRecurrenceLabel(routine.recurrence_pattern)}
                    </div>
                  </div>

                  {/* Assignment button */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenDropdown(isOpen ? null : routine.id)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        assigned
                          ? `${getColorClass(assigned.color)} text-white`
                          : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                      }`}
                    >
                      {assigned ? (
                        assigned.initials
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </button>

                    {/* Dropdown */}
                    {isOpen && (
                      <div className="absolute right-0 top-12 z-10 bg-white rounded-lg shadow-lg border border-neutral-100 py-2 min-w-[160px]">
                        {familyMembers.map((member) => (
                          <button
                            key={member.id}
                            onClick={() => handleAssign(routine.id, member.id)}
                            className="w-full px-4 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors"
                          >
                            <div className={`w-8 h-8 rounded-full ${getColorClass(member.color)} flex items-center justify-center text-white text-sm font-medium`}>
                              {member.initials}
                            </div>
                            <span className="text-neutral-700">{member.name}</span>
                          </button>
                        ))}
                        {assigned && (
                          <>
                            <div className="border-t border-neutral-100 my-1" />
                            <button
                              onClick={() => handleAssign(routine.id, null)}
                              className="w-full px-4 py-2 text-left text-neutral-400 hover:bg-neutral-50 text-sm"
                            >
                              Unassign
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onContinue}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Continue
          </button>

          <button
            onClick={onSkip}
            className="text-sm text-neutral-400 hover:text-neutral-600"
          >
            Skip — I'll assign later
          </button>
        </div>
      </div>
    </div>
  )
}
