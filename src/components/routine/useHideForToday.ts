// src/components/routine/useHideForToday.ts
//
// "Hide for today" skips ONE occurrence: it writes an actionable_instances row
// with status 'skipped' for this routine on this date, through the existing
// instance writer. Today already drops a skipped occurrence
// (routinesForViewedDate); the routine itself — its rule, its rest state, its
// place on the week and the kiosk — is untouched, so it is back tomorrow.
//
// It used to write visibility 'reference' + paused_until tomorrow, which
// rested the WHOLE routine everywhere. That is "Rest until…", a different,
// stronger promise.

import { useCallback, useEffect, useState } from 'react'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'

export function useHideForToday() {
  const { skip, undoDone } = useActionableInstances()
  const { run } = useCanvasActivity()

  /** Skip this date's occurrence. Undo returns it to the day. */
  const hideForToday = useCallback((routineId: string, name: string, date: Date) => {
    const write = () => skip('routine', routineId, date)
    const again = () => { void run(`Hide "${name}" for today`, write, { ids: [routineId], undo: () => undoDone('routine', routineId, date) }) }
    return run(`Hide "${name}" for today`, write, {
      ids: [routineId],
      undo: () => undoDone('routine', routineId, date),
      retry: again,
    })
  }, [skip, undoDone, run])

  /** Un-skip this date's occurrence. Undo skips it again. */
  const showToday = useCallback((routineId: string, name: string, date: Date) => {
    return run(`Show "${name}" today again`, () => undoDone('routine', routineId, date), {
      ids: [routineId],
      undo: () => skip('routine', routineId, date),
    })
  }, [skip, undoDone, run])

  return { hideForToday, showToday }
}

/** Whether this routine's occurrence on `date` is skipped. Null while unknown. */
export function useSkippedOn(routineId: string | null | undefined, date: Date): boolean | null {
  const { getInstance } = useActionableInstances()
  const key = date.toDateString()
  const [state, setState] = useState<{ key: string; skipped: boolean } | null>(null)
  useEffect(() => {
    if (!routineId) return
    let live = true
    const read = async () => {
      const [y, m, d] = [date.getFullYear(), date.getMonth(), date.getDate()]
      const instance = await getInstance('routine', routineId, new Date(y, m, d))
      if (live) setState({ key: `${routineId}:${key}`, skipped: instance?.status === 'skipped' })
    }
    void read()
    const stop = onInstancesChanged(() => { void read() })
    return () => { live = false; stop() }
    // `date` is read through `key`: a new Date for the same day must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId, key, getInstance])
  if (!routineId || state?.key !== `${routineId}:${key}`) return null
  return state.skipped
}
