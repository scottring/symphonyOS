// src/components/plan/v2/PlanPurpose.tsx
//
// What an ordinary Year, Season or Month page is for, in one quiet line, and
// where to go from it (friends-and-family walk, 2026-10-08: someone arriving
// straight at Season or Month had a list and a status but no direction, and
// "Plan with guidance" lived three menus away).
//
// Lists above the week are for looking (docs/superpowers/specs/
// 2026-10-04-planning-model-design.md): the year is reference, a season a
// brainstorm list, a month a plain list written with its season beside it. The
// words here say only that. While a guided plan is running the guide bar asks
// the question and names the next step, so this steps aside entirely.
import { Link, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { currentStep, resume, stepPath } from '@/lib/guide/guidedPlan'
import { writePlanView } from '@/lib/planning/v2/planV2'

export type PurposeLevel = 'year' | 'season' | 'month'

/** The one line saying what this level's list is for. */
export function purposeLine(level: PurposeLevel, name: string, opts: { isCurrent: boolean; above?: string }): string {
  if (level === 'year') return `What do you want ${opts.isCurrent ? 'this year' : name} to hold? A few words is enough.`
  if (level === 'season') return `Everything you’d like ${name} to hold — a brainstorm list. Nothing needs a date.`
  return `What should ${name} move forward? A plain list${opts.above ? `, with ${opts.above} beside it to look at` : ''}.`
}

/** The empty list's prompt: a couple of shapes a line can take. */
export function emptyPrompt(level: PurposeLevel, name: string): string {
  if (level === 'year') return `Nothing on ${name}’s list yet. Try a few words, like “More time outdoors as a family” or “Finish the house projects.”`
  if (level === 'season') return `Nothing on ${name}’s list yet. Try a few words, like “Finish Mia’s room” or “Swim twice a week.” No dates needed.`
  return `Nothing on ${name}’s list yet. Try a few words, like “Book Liam’s check-up” or “Clear out the garage.”`
}

export interface Onward { label: string; to: string; view?: 'season' | 'month' | 'week' }

/**
 * The page's purpose line, an optional onward step, and the way into guided
 * planning (or back into a paused run). Renders nothing while a guided run is
 * active — the guide bar already says all of it.
 */
export function PlanPurpose({ text, onward }: { text: string; onward: Onward | null }) {
  const { state, set } = useGuidedPlan()
  const navigate = useNavigate()
  if (state?.status === 'active') return null
  const paused = state?.status === 'paused' ? state : null
  const resumeGuide = () => {
    if (!paused) return
    const r = resume(paused)
    void set(r)
    const step = currentStep(r)
    if (step === 'week' || step === 'month' || step === 'season') writePlanView(step, 'ref')
    navigate(stepPath(step, r))
  }
  return (
    <div className="plan-purpose">
      <p className="plan-purpose-line">{text}</p>
      <div className="plan-purpose-acts">
        {onward && (
          <button type="button" className="pv2-link" onClick={() => {
            // The next page opens with this one beside it, ready to write.
            if (onward.view) writePlanView(onward.view, 'ref')
            navigate(onward.to, { state: { write: true } })
          }}>Next: {onward.label} →</button>
        )}
        {paused
          ? <button type="button" className="pv2-link pv2-quiet" onClick={resumeGuide}>Resume guidance</button>
          : <Link to="/start" className="pv2-link pv2-quiet">Plan with guidance</Link>}
      </div>
    </div>
  )
}

/**
 * "Saved to Fall — “Swim twice a week”": the line under the add field once a
 * new line is stored. Always mounted so a screen reader hears the change;
 * empty until something is saved.
 */
export function SavedToNote({ saved }: { saved: { to: string; title: string } | null }) {
  return (
    <p className="plan-saved-note" role="status">
      {saved && <><Check className="h-3.5 w-3.5" aria-hidden="true" /><span>Saved to {saved.to} — “{saved.title}”</span></>}
    </p>
  )
}
