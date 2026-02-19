import { useState, useMemo } from 'react'

interface SundayNudgeBannerProps {
  onOpenWeeklyReview: () => void
}

/** Get ISO week key for localStorage dismissal, e.g. "2026-W08" */
function getISOWeekKey(): string {
  const now = new Date()
  const jan4 = new Date(now.getFullYear(), 0, 4)
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1
  const weekNumber = Math.ceil((dayOfYear + jan4.getDay() - 1) / 7)
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

export function SundayNudgeBanner({ onOpenWeeklyReview }: SundayNudgeBannerProps) {
  const storageKey = useMemo(() => `symphony-sunday-nudge-${getISOWeekKey()}`, [])

  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(storageKey) === 'true'
  })

  if (dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true')
    setDismissed(true)
  }

  return (
    <div className="mb-4 md:mb-6 px-1 animate-fade-in-up">
      <div className="bg-amber-50/60 border border-amber-200/40 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg text-neutral-800 mb-1">
              Time for your weekly review
            </h3>
            <p className="text-sm text-neutral-500 mb-4">
              Review last week and plan ahead. See what worked, what didn't, and set up next week's playbook.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={onOpenWeeklyReview}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
              >
                Start Review
              </button>
              <button
                onClick={handleDismiss}
                className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
