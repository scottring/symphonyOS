import { useState, useEffect } from 'react'

const STORAGE_KEY = 'symphony_meal_tour_v1_completed'

interface Props {
  /** Reactive signals used by auto-advance steps. */
  briefBody: string
  planGeneratedAt: Date | undefined
  planEntryCount: number
  /** Set by the parent when a successful Send-to-Reminders completes. */
  lastSendAt: Date | null
  /** Called when the tour is dismissed/completed. Lets the parent unmount. */
  onDismiss: () => void
}

interface Step {
  id: 'welcome' | 'brief' | 'generate' | 'read' | 'plan' | 'prep' | 'groceries' | 'send' | 'done'
  title: string
  body: string
  anchor?: string
  autoAdvance?: (props: Props) => boolean
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to your Sunday ritual.',
    body: "I'll walk you through it once; you can skip anytime.",
  },
  {
    id: 'brief',
    title: 'Start by writing your brief.',
    body: 'Keep it loose — preferences, restrictions, special requests. Symphony drafts your week from this.',
    anchor: '#brief',
    autoAdvance: (p) => p.briefBody.trim().length > 0,
  },
  {
    id: 'generate',
    title: 'Now click Generate.',
    body: "Symphony will draft a full week from your brief. It takes about 10 seconds.",
    anchor: '#brief',
    autoAdvance: (p) => p.planGeneratedAt != null || p.planEntryCount > 0,
  },
  {
    id: 'read',
    title: "Symphony's read on the week.",
    body: "What's different, what's new. Skim it, edit if needed.",
    anchor: '#read',
  },
  {
    id: 'plan',
    title: 'The week\'s meals.',
    body: 'Click any meal to swap it, or assign a cook via the chip.',
    anchor: '#plan',
  },
  {
    id: 'prep',
    title: 'Sunday batch cook.',
    body: 'If there\'s a Sunday batch, click Distribute to set who eats it which day.',
    anchor: '#prep',
  },
  {
    id: 'groceries',
    title: 'Review the shopping list.',
    body: 'The store chip routes items to different stores; H/M/L lets you mark what you already have.',
    anchor: '#groceries',
  },
  {
    id: 'send',
    title: 'Send to Apple Reminders.',
    body: "Click Send to push to Apple Reminders. The bridge syncs to everyone's iPhones within 60 seconds.",
    anchor: '#groceries',
    autoAdvance: (p) => p.lastSendAt != null,
  },
  {
    id: 'done',
    title: "That's it.",
    body: 'Sundays from now on are this scroll. Welcome to Symphony.',
  },
]

/** Small fixed card pinned bottom-right that guides the user through the
 *  Sunday meal-planning ritual. Persists to localStorage when completed or
 *  skipped. The parent decides whether to mount based on localStorage state. */
export function RitualTour({ briefBody, planGeneratedAt, planEntryCount, lastSendAt, onDismiss }: Props) {
  const [stepIndex, setStepIndex] = useState(0)

  const step = STEPS[stepIndex]
  const props: Props = { briefBody, planGeneratedAt, planEntryCount, lastSendAt, onDismiss }

  // Auto-advance when a step's condition becomes true.
  useEffect(() => {
    if (!step.autoAdvance) return
    if (step.autoAdvance(props)) {
      setStepIndex(i => Math.min(i + 1, STEPS.length - 1))
    }
  }, [briefBody, planGeneratedAt, planEntryCount, lastSendAt, stepIndex])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    onDismiss()
  }

  const onNext = () => {
    const nextIndex = Math.min(stepIndex + 1, STEPS.length - 1)
    const nextStep = STEPS[nextIndex]
    if (nextStep.anchor) {
      document.getElementById(nextStep.anchor.replace('#', ''))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setStepIndex(nextIndex)
  }

  const isDone = step.id === 'done'

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full rounded-2xl border border-neutral-200 bg-bg-elevated shadow-elevated px-5 py-4">
      {/* Step indicator */}
      <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
        Step {stepIndex + 1} of {STEPS.length}
      </div>

      {/* Title */}
      <div className="font-display text-[1.05rem] text-neutral-800 leading-snug">
        {step.title}
      </div>

      {/* Body */}
      <p className="text-[13px] text-neutral-600 mt-1 leading-relaxed">
        {step.body}
      </p>

      {/* Bottom row */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={dismiss}
          className="text-[12px] italic text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          Skip tour
        </button>

        {isDone ? (
          <button
            onClick={dismiss}
            className="px-3 py-1 rounded-full bg-primary-500 text-white text-[12px] font-medium hover:bg-primary-600 transition-colors"
          >
            Got it
          </button>
        ) : (
          <button
            onClick={onNext}
            className="px-3 py-1 rounded-full bg-primary-500 text-white text-[12px] font-medium hover:bg-primary-600 transition-colors"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  )
}
