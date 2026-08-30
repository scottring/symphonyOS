/** Pure math for target-step progress ("read ≥20 min"). The hook applies the
 * patch to the day's actionable_instance row; completion is DERIVED from
 * progress vs target, so corrections (setProgress) can also un-complete. */
export interface ProgressPatch {
  progress: number
  status: 'completed' | 'pending'
  completed_at: string | null
}

function patch(progress: number, target: number | null, now: Date): ProgressPatch {
  const clamped = Math.max(0, progress)
  const done = target != null && clamped >= target
  return {
    progress: clamped,
    status: done ? 'completed' : 'pending',
    completed_at: done ? now.toISOString() : null,
  }
}

export function applyProgressDelta(current: number | null, delta: number, target: number | null, now: Date): ProgressPatch {
  return patch((current ?? 0) + delta, target, now)
}

export function applyProgressExact(value: number, target: number | null, now: Date): ProgressPatch {
  return patch(value, target, now)
}
