// src/components/planning/guided/CoachLines.tsx
//
// Layer 1 of the session guide, rendered: the deterministic observations from
// computeCoachLines, shown as one or two quiet lines between the narration and
// the step body. The narration is the script; these are what the script can't
// know — computed live from the user's actual lists. No network, no model.
import { useMemo } from 'react'
import { Sparkles, Eye } from 'lucide-react'
import { computeCoachLines } from '@/lib/planning/coachLines'
import { useGuided } from './GuidedContext'

export function CoachLines() {
  const { step, host } = useGuided()

  const lines = useMemo(
    () => computeCoachLines({
      stepType: step.type,
      bucket: step.props?.bucket,
      aboveBucket: step.props?.aboveBucket,
      tasks: host.tasks,
      goals: host.goals,
      projects: host.projects,
    }),
    [step.type, step.props?.bucket, step.props?.aboveBucket, host.tasks, host.goals, host.projects],
  )

  if (host.tasksLoading || lines.length === 0) return null

  return (
    <div className="space-y-2" data-testid="coach-lines">
      {lines.map((l) => (
        <p
          key={l.id}
          className={`flex items-start gap-2 text-[13.5px] leading-relaxed rounded-lg px-3 py-2 ${
            l.tone === 'ok'
              ? 'text-primary-800 bg-primary-50/70'
              : 'text-amber-800 bg-amber-50/80'
          }`}
        >
          {l.tone === 'ok'
            ? <Sparkles className="w-3.5 h-3.5 mt-[3px] shrink-0 opacity-70" />
            : <Eye className="w-3.5 h-3.5 mt-[3px] shrink-0 opacity-70" />}
          <span>{l.text}</span>
        </p>
      ))}
    </div>
  )
}
