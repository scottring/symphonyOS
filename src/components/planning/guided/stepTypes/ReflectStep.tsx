// src/components/planning/guided/stepTypes/ReflectStep.tsx
//
// Voiced prompt + shared textarea. Persists to planning_sessions.notes[key]
// via the debounced patch — visible to household members (the couple ritual).
import { useGuided } from '../GuidedContext'

export function ReflectStep() {
  const { step, notes, patchNotes, domain } = useGuided()
  const key = step.props?.notesKey
  if (!key) return null
  const variant = domain !== 'universal' ? step.byDomain?.[domain] : undefined
  return (
    <textarea
      value={(notes[key] as string) ?? ''}
      onChange={(e) => patchNotes({ [key]: e.target.value })}
      placeholder={variant?.placeholder ?? step.props?.placeholder}
      rows={6}
      autoFocus
      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] text-neutral-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30"
    />
  )
}
