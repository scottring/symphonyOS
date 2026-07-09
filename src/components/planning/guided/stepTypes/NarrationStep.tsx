// src/components/planning/guided/stepTypes/NarrationStep.tsx
//
// Pure instruction moment. The shell already renders title + narration text
// and the Next button, so this step's body is just the session's pacing hint.
import { Clock } from 'lucide-react'
import { useGuided } from '../GuidedContext'
import { SESSIONS } from '../sessions'

export function NarrationStep() {
  const { horizon } = useGuided()
  const [lo, hi] = SESSIONS[horizon].estMinutes
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-neutral-400">
      <Clock className="w-4 h-4" /> About {lo}–{hi} minutes, all steps skippable.
    </p>
  )
}
