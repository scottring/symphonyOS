// Where a person is in a guided planning session, kept as `notes.guide` (usePlanningNotes).
// Changes show at once and are saved after; `markPlanned` also sets the row's `savedAt`
// so the existing "planned" readers and the nudge agree.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlanningNotes } from '@/hooks/usePlanningNotes'
import { HORIZON_OF, stepsFor, type GuideLevel } from '@/lib/guide/steps'
import { goNext, jumpTo, parseProgress, skipStep, startProgress, type GuideProgress } from '@/lib/guide/progress'

export function useGuidedProgress(level: GuideLevel, token: string) {
  const { notes, loading, patch } = usePlanningNotes(HORIZON_OF[level], token)
  const [progress, setProgress] = useState<GuideProgress>(() => startProgress(level))
  const ref = useRef(progress)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  // Take the saved step when a load finishes; later saves don't echo back over newer taps.
  const guideRef = useRef(notes.guide)
  useEffect(() => { guideRef.current = notes.guide }, [notes.guide])
  useEffect(() => {
    if (loading) return
    const p = parseProgress(guideRef.current, level)
    ref.current = p
    setProgress(p)
  }, [loading, level])

  // Saves run one after another so each read-then-merge sees the one before.
  const commit = useCallback(async (p: GuideProgress, extra?: Record<string, unknown>, defaults?: Record<string, unknown>) => {
    ref.current = p
    setProgress(p)
    const run = queue.current.then(() => patch({ guide: p, ...extra }, defaults))
    queue.current = run.catch(() => undefined)
    await run
  }, [patch])

  const next = useCallback(async () => { if (!loading) await commit(goNext(ref.current, level)) }, [commit, level, loading])
  const skip = useCallback(async () => { if (!loading) await commit(skipStep(ref.current, level)) }, [commit, level, loading])
  const jump = useCallback(async (id: string) => {
    if (loading || !stepsFor(level).some(s => s.id === id)) return
    const p = jumpTo(ref.current, id)
    if (p !== ref.current) await commit(p)
  }, [commit, level, loading])
  const markPlanned = useCallback(async () => {
    if (loading) return
    const now = new Date().toISOString()
    const cur = ref.current
    await commit(cur.plannedAt ? cur : { ...cur, plannedAt: now }, undefined, { savedAt: now })
  }, [commit, loading])
  const finish = useCallback(async () => {
    if (loading) return
    await commit({ ...ref.current, finishedAt: new Date().toISOString() })
  }, [commit, loading])
  const setThreadId = useCallback(async (id: string) => {
    if (loading) return
    await commit({ ...ref.current, threadId: id })
  }, [commit, loading])

  return { progress, loading, next, skip, jump, markPlanned, finish, setThreadId }
}
