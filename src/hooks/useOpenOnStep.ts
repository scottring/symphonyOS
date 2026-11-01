// `?step=<id>` on a guided session's page opens the session on that step
// (spec 2026-11-01): a link such as "Edit" on the Year page's Vision, or
// "Review October". Applied once, when the session's place has loaded, and
// only for an id that is a step of this level; then `step` leaves the URL
// (replace, no new history entry) so a reload resumes where the session is.

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { stepsFor, type GuideLevel } from '@/lib/guide/steps'

export function useOpenOnStep(level: GuideLevel, loading: boolean, jump: (id: string) => Promise<void> | void) {
  const [params, setParams] = useSearchParams()
  const step = params.get('step')
  const jumpRef = useRef(jump)
  useEffect(() => { jumpRef.current = jump })
  useEffect(() => {
    if (loading || step === null) return
    if (stepsFor(level).some((s) => s.id === step)) void jumpRef.current(step)
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      p.delete('step')
      return p
    }, { replace: true })
  }, [loading, step, level, setParams])
}
