// src/components/schedule/FirstWeekCard.tsx
//
// A fresh household lands on an empty Today with no guidance. This card
// lists four real steps, each a link into the flow that actually does the
// thing — not a checklist someone has to tick by hand. A done step collapses
// to a one-line result. Mounted above the day by HomeViewContainer while
// `shouldShowFirstWeek` says so; hides itself for a week on "Hide for now",
// never permanently.
//
// Its gutters mirror MastheadCard's (`mx-3 md:mx-0`) and its mount supplies
// the same page column, so it stacks directly on top of the day card with
// the same left and right edges instead of spanning the whole content width.

import { Link } from 'react-router-dom'
import { Circle, CheckCircle2, ArrowRight } from 'lucide-react'
import type { FirstWeekStep } from '@/lib/firstWeek'

interface FirstWeekCardProps {
  steps: FirstWeekStep[]
  onHide: () => void
  onSamplePage: () => void
  /** Present only when there's a sample page to clear (rows the bundled
   *  sample image created). Omitted → no "Clear sample" offer at all. */
  onClearSample?: () => void
}

export function FirstWeekCard({ steps, onHide, onSamplePage, onClearSample }: FirstWeekCardProps) {
  return (
    <section aria-labelledby="first-week" className="card mx-3 mb-4 p-5 md:mx-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 id="first-week" className="font-display text-lg text-neutral-800">
          Your first week
        </h2>
        <button
          type="button"
          onClick={onHide}
          className="text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
        >
          Hide for now
        </button>
      </div>

      <ul className="space-y-2.5">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5">
            {step.done ? (
              <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <Circle className="w-5 h-5 text-neutral-300 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="min-w-0">
              {step.done ? (
                <div className="text-[15px] text-neutral-500">
                  <span className="text-neutral-700">{step.title}</span>
                  {step.doneLine && (
                    <>
                      {' — '}
                      <span className="text-neutral-400">{step.doneLine}</span>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  to={step.to}
                  className="inline-flex items-center gap-1.5 text-[15px] text-neutral-800 hover:text-primary-700 transition-colors group"
                >
                  {step.title}
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-primary-600 transition-colors" aria-hidden="true" />
                </Link>
              )}

              {step.id === 'page' && !step.done && (
                <div className="text-[13px] text-neutral-500 mt-0.5">
                  No paper handy?{' '}
                  <button
                    type="button"
                    onClick={onSamplePage}
                    className="text-primary-700 hover:text-primary-800 underline underline-offset-2"
                  >
                    Use our sample page
                  </button>
                </div>
              )}

              {step.id === 'page' && step.done && onClearSample && (
                <div className="text-[13px] mt-0.5">
                  <button
                    type="button"
                    onClick={onClearSample}
                    className="text-neutral-400 hover:text-neutral-600 underline underline-offset-2"
                  >
                    Clear sample
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
