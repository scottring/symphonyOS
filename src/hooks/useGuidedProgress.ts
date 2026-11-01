// Where a person is in a guided planning session, kept as `notes.guide` (usePlanningNotes).
// Changes show at once and are saved after; `markPlanned` also sets the row's `savedAt`
// so the existing "planned" readers and the nudge agree.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlanningNotes } from '@/hooks/usePlanningNotes'
import { HORIZON_OF, stepsFor, type GuideLevel } from '@/lib/guide/steps'
import { goNext, jumpTo, parseProgress, reopenProgress, skipStep, startProgress, type GuideProgress } from '@/lib/guide/progress'

export function useGuidedProgress(level: GuideLevel, token: string) {
  const { notes, loading, patch } = usePlanningNotes(HORIZON_OF[level], token)
  const [progress, setProgress] = useState<GuideProgress>(() => startProgress(level))
  const ref = useRef(progress)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Take the saved step when a load finishes (a finished session starts again
  // at the top); later saves don't echo back over newer taps.
  const guideRef = useRef(notes.guide)
  useEffect(() => { guideRef.current = notes.guide }, [notes.guide])
  useEffect(() => {
    if (loading) return
    const p = reopenProgress(parseProgress(guideRef.current, level), level)
    ref.current = p
    setProgress(p)
  }, [loading, level])

  // patch serializes saves per row; a failed save keeps the optimistic step and sets saveError.
  const commit = useCallback(async (p: GuideProgress, extra?: Record<string, unknown>, defaults?: Record<string, unknown>): Promise<boolean> => {
    ref.current = p
    setProgress(p)
    const ok = await patch({ guide: p, ...extra }, defaults)
    setSaveError(ok ? null : 'Could not save your place. It may not be there next time.')
    return ok
  }, [patch])

  const next = useCallback(async () => { if (!loading) await commit(goNext(ref.current, level)) }, [commit, level, loading])
  const skip = useCallback(async () => { if (!loading) await commit(skipStep(ref.current, level)) }, [commit, level, loading])
  const jump = useCallback(async (id: string) => {
    if (loading || !stepsFor(level).some(s => s.id === id)) return
    const p = jumpTo(ref.current, id)
    if (p !== ref.current) await commit(p)
  }, [commit, level, loading])
  /** Resolves whether the planned mark saved. One that didn't is taken back,
   *  so the next applied write can try again. */
  const markPlanned = useCallback(async (): Promise<boolean> => {
    if (loading) return false
    const now = new Date().toISOString()
    const cur = ref.current
    const ok = await commit(cur.plannedAt ? cur : { ...cur, plannedAt: now }, undefined, { savedAt: now })
    if (!ok && ref.current.plannedAt === now) {
      const { plannedAt: _p, ...back } = ref.current
      ref.current = back
      setProgress(back)
    }
    return ok
  }, [commit, loading])
  const finish = useCallback(async () => {
    if (loading) return
    await commit({ ...ref.current, finishedAt: new Date().toISOString() })
  }, [commit, loading])
  const setThreadId = useCallback(async (id: string) => {
    if (loading) return
    await commit({ ...ref.current, threadId: id })
  }, [commit, loading])

  return { progress, loading, saveError, next, skip, jump, markPlanned, finish, setThreadId }
}
