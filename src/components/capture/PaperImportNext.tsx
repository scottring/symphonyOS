// src/components/capture/PaperImportNext.tsx
//
// After a paper import is saved: one compact line that stays on the page
// until it is answered — what was saved, where, and the next planning step
// (friends-and-family beta, 2026-10-08: the review closed on a brief toast
// and left nothing to do next). "Continue planning" goes one rung down the
// cascade, or on with a guided plan when one is running; "Done for now"
// only dismisses — everything is already saved.
//
// Any page with "Add from paper" hosts it (FromPaper). The words and the
// destination are decided in lib/paperPlan/importNext.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { useGuideNext } from '@/components/guide/GuideBar'
import { currentStep, pageOf, stepPath, stepShortName, isReview } from '@/lib/guide/guidedPlan'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { readSeasons } from '@/lib/cadence/seasons'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { periodBounds } from '@/lib/planning/periodPage'
import { writePlanView } from '@/lib/planning/v2/planV2'
import { nextAfterImport, savedHeadline, type SavedImport } from '@/lib/paperPlan/importNext'
import { clearPaperImport, setPaperWeekFocus, takeFresh, usePaperImport } from '@/lib/paperPlan/importNextStore'

// Several pages can host the panel at once (a page and the one it hands to,
// mid-navigation); only the first mounted host draws it.
const hosts: symbol[] = []
const hostListeners = new Set<() => void>()
const subscribeHosts = (l: () => void) => { hostListeners.add(l); return () => { hostListeners.delete(l) } }
const emitHosts = () => { for (const l of hostListeners) l() }

function useFirstHost(): boolean {
  const [id] = useState(() => Symbol('paper-next-host'))
  useEffect(() => {
    hosts.push(id)
    emitHosts()
    return () => {
      const i = hosts.indexOf(id)
      if (i >= 0) hosts.splice(i, 1)
      emitHosts()
    }
  }, [id])
  return useSyncExternalStore(subscribeHosts, () => hosts[0] === id, () => false)
}

export function PaperImportNext() {
  const saved = usePaperImport()
  const first = useFirstHost()
  if (!saved || !first) return null
  return createPortal(<Panel key={saved.id} saved={saved} />, document.body)
}

function Panel({ saved }: { saved: SavedImport }) {
  const navigate = useNavigate()
  const { state: guide } = useGuidedPlan()
  const guideNext = useGuideNext()
  const ref = useRef<HTMLDivElement>(null)
  // Announced just now, as the review closed: take focus once, so the next
  // Tab is "Continue planning" (a panel restored after a reload does not).
  useEffect(() => {
    if (takeFresh(saved.id)) ref.current?.focus({ preventScroll: true })
  }, [saved.id])

  const { headline, detail } = savedHeadline(saved)
  const next = useMemo(() => {
    const seasons = readSeasons()
    const wso = readCadenceConfig().weekStartsOn
    const weekNumber = (d: Date) => weekOfYear(d, wso)
    const own = nextAfterImport(saved, new Date(), {
      weekStartOf: (d) => weekStartAnchor(d, wso),
      weekNumber,
      seasonOf: (d) => { const b = periodBounds('season', d, seasons); return { start: b.start, name: b.label.replace(/\s+\d{4}$/, '') } },
    })
    // A guided plan is running: go on with it rather than around it.
    if (guide?.status === 'active') {
      const step = currentStep(guide)
      if (!isReview(step) && step === saved.altitude && guide.periods[step] === saved.periodStart) {
        // The page filled IS the guide's step: continuing moves the guide on.
        const after = guide.steps[guide.current + 1]
        return {
          sentence: after ? `Next in your guided plan: ${stepShortName(after, guide, seasons, weekNumber)}.` : 'Next, finish your guided plan.',
          go: () => { void guideNext(guide) },
          weekFocus: own.weekFocus && after === 'week',
        }
      }
      const page = pageOf(step)
      return {
        sentence: `Next, back to your guided plan: ${stepShortName(step, guide, seasons, weekNumber)}.`,
        go: () => {
          if (page === 'week' || page === 'month' || page === 'season') writePlanView(page, 'ref')
          navigate(stepPath(step, guide))
        },
        weekFocus: own.weekFocus && page === 'week',
      }
    }
    return {
      sentence: own.sentence,
      go: () => {
        if (own.openRefOn) writePlanView(own.openRefOn, 'ref')
        navigate(own.to)
      },
      weekFocus: own.weekFocus,
    }
  }, [saved, guide, guideNext, navigate])

  const onContinue = () => {
    // The week opens with this month beside it, the imported lines marked.
    if (next.weekFocus) setPaperWeekFocus({ monthStart: saved.periodStart, taskIds: saved.taskIds })
    clearPaperImport()
    next.go()
  }

  return (
    <div ref={ref} tabIndex={-1} role="status" aria-labelledby="paper-next-headline" className="pv2-saved paper-next">
      <Check className="paper-next-icon" aria-hidden="true" />
      <p className="pv2-saved-text">
        <b id="paper-next-headline">{headline}</b>
        {detail && <> {detail}</>}
        {' '}{next.sentence}
      </p>
      <div className="paper-next-acts">
        <button type="button" className="pv2-btn" onClick={onContinue}>Continue planning</button>
        <button type="button" className="pv2-link pv2-quiet" onClick={clearPaperImport}>Done for now</button>
      </div>
    </div>
  )
}
