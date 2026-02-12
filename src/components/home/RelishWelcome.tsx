// RelishWelcome — Zone 1 of the Relish home
// Greeting, family name, coherence pulse, check-in nudge

import type { Manual } from '@/types/manual'
import { CoherencePulse } from './CoherencePulse'

interface RelishWelcomeProps {
  userName: string
  householdName: string
  manual: Manual | null
  hasCheckedInThisWeek: boolean
  driftSignalCount: number
  onStartCheckin: () => void
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function RelishWelcome({
  userName,
  householdName,
  manual,
  hasCheckedInThisWeek,
  driftSignalCount,
  onStartCheckin,
}: RelishWelcomeProps) {
  const greeting = getGreeting()

  return (
    <div className="px-6 md:px-8 pt-8 pb-4">
      {/* Greeting + household name */}
      <div className="mb-3">
        <p className="text-sm text-neutral-500">{greeting}, {userName}</p>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-neutral-800 tracking-tight">
          {householdName}
        </h1>
      </div>

      {/* Coherence pulse + check-in nudge */}
      <div className="flex items-center justify-between gap-4">
        <CoherencePulse manual={manual} />

        {!hasCheckedInThisWeek && (
          <button
            onClick={onStartCheckin}
            className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
          >
            {driftSignalCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
            )}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Weekly check-in
          </button>
        )}
      </div>
    </div>
  )
}
