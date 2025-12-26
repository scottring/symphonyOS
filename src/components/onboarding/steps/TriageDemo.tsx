import { useState } from 'react'
import type { Task } from '@/types/task'

interface TriageDemoProps {
  task: Task | null
  onUpdateTask: (id: string, updates: Partial<Task>) => Promise<void>
  onContinue: () => void
}

type TriageAction = 'schedule' | 'defer' | 'skip' | 'tag'

function getNextThursday(): Date {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7 // 4 = Thursday
  const thursday = new Date(today)
  thursday.setDate(today.getDate() + daysUntilThursday)
  thursday.setHours(9, 0, 0, 0)
  return thursday
}

function getNextWeek(): Date {
  const today = new Date()
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)
  nextWeek.setHours(9, 0, 0, 0)
  return nextWeek
}

function getTomorrow(): Date {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return tomorrow
}

export function TriageDemo({ task, onUpdateTask, onContinue }: TriageDemoProps) {
  const [selectedAction, setSelectedAction] = useState<TriageAction | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleAction = async (action: TriageAction) => {
    if (!task || isProcessing) return

    setIsProcessing(true)
    setSelectedAction(action)

    let scheduledFor: Date | undefined = undefined
    let context: 'family' | undefined = undefined

    switch (action) {
      case 'schedule':
        scheduledFor = getNextThursday()
        break
      case 'defer':
        scheduledFor = getNextWeek()
        break
      case 'skip':
        scheduledFor = getTomorrow()
        break
      case 'tag':
        context = 'family'
        break
    }

    await onUpdateTask(task.id, { scheduledFor, context })
    setIsProcessing(false)
  }

  if (!task) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-neutral-800 mb-4">
          Life changes. Symphony adapts.
        </h1>
        <p className="text-neutral-500 mb-8">
          You'll learn to triage tasks as you use the app.
        </p>
        <button
          onClick={onContinue}
          className="btn-primary px-8 py-3 text-lg font-medium"
        >
          Continue
        </button>
      </div>
    )
  }

  if (selectedAction) {
    const actionMessages: Record<TriageAction, string> = {
      schedule: `You scheduled "${task.title}" for Thursday. It'll appear on your Today view that morning.`,
      defer: `You deferred "${task.title}" to next week. It'll reappear when you're ready.`,
      skip: `You skipped "${task.title}". It'll show up again tomorrow.`,
      tag: `You tagged "${task.title}" as Family. It'll show with an amber tag and surface during family time.`,
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 pt-24">
        <div className="w-full max-w-lg text-center">
          <div className="text-5xl mb-6">✓</div>
          <h1 className="font-display text-3xl font-semibold text-neutral-800 mb-4">
            Perfect!
          </h1>
          <p className="text-lg text-neutral-600 mb-8">
            {actionMessages[selectedAction]}
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-left">
            <p className="text-sm text-amber-800">
              💡 <span className="font-medium">Pro tip:</span> Use domains to keep work, family, and personal separate.
              Switch domains to focus on what matters right now.
            </p>
          </div>

          <button
            onClick={onContinue}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          Life changes. Symphony adapts.
        </h1>

        {/* Task card */}
        <div className="p-4 bg-white rounded-lg border border-neutral-100 mb-6">
          <div className="text-neutral-800 font-medium">{task.title}</div>
          <div className="text-sm text-neutral-400 mt-1">In your inbox</div>
        </div>

        <p className="text-neutral-500 text-center mb-6">
          Organize this task with scheduling and tagging:
        </p>

        {/* Action cards */}
        <div className="space-y-4 mb-8">
          <button
            onClick={() => handleAction('schedule')}
            disabled={isProcessing}
            className="w-full p-4 bg-white rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">📅</span>
              <div>
                <div className="font-medium text-neutral-800 group-hover:text-primary-700">Schedule</div>
                <div className="text-sm text-neutral-500">Pick a specific day to do this task</div>
                <div className="text-sm text-primary-600 mt-1">→ Thursday</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAction('defer')}
            disabled={isProcessing}
            className="w-full p-4 bg-white rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">💤</span>
              <div>
                <div className="font-medium text-neutral-800 group-hover:text-primary-700">Defer</div>
                <div className="text-sm text-neutral-500">Hide it until you're ready to think about it</div>
                <div className="text-sm text-primary-600 mt-1">→ Next week</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAction('skip')}
            disabled={isProcessing}
            className="w-full p-4 bg-white rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">⏭️</span>
              <div>
                <div className="font-medium text-neutral-800 group-hover:text-primary-700">Skip</div>
                <div className="text-sm text-neutral-500">Not today — show me tomorrow instead</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAction('tag')}
            disabled={isProcessing}
            className="w-full p-4 bg-white rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">🏷️</span>
              <div>
                <div className="font-medium text-neutral-800 group-hover:text-primary-700">Tag as Family</div>
                <div className="text-sm text-neutral-500">Organize by domain: Work, Family, or Personal</div>
                <div className="text-sm flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  <span className="text-amber-600">Family</span>
                </div>
              </div>
            </div>
          </button>
        </div>

        <p className="text-center text-sm text-neutral-400">
          Try it! Tap one of the options above.
        </p>
      </div>
    </div>
  )
}
