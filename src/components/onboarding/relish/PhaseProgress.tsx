import type { OnboardingPhaseId } from '@/types/manual'
import { PHASE_NAMES } from '@/types/manual'

interface PhaseProgressProps {
  completedPhases: OnboardingPhaseId[]
  currentPhase: OnboardingPhaseId
}

const PHASES: OnboardingPhaseId[] = ['foundation', 'relationships', 'operations', 'strategy']

export function PhaseProgress({ completedPhases, currentPhase }: PhaseProgressProps) {
  return (
    <div className="flex items-center gap-2">
      {PHASES.map((phase, i) => {
        const isComplete = completedPhases.includes(phase)
        const isCurrent = phase === currentPhase

        return (
          <div key={phase} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`w-6 h-px ${isComplete ? 'bg-stone-400' : 'bg-stone-200'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isComplete
                    ? 'bg-stone-900 text-white'
                    : isCurrent
                      ? 'bg-stone-100 text-stone-900 ring-2 ring-stone-400'
                      : 'bg-stone-100 text-stone-400'
                }`}
              >
                {isComplete ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs hidden sm:inline ${
                  isCurrent ? 'text-stone-700 font-medium' : 'text-stone-400'
                }`}
              >
                {PHASE_NAMES[phase]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
