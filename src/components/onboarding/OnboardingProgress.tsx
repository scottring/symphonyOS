import type { OnboardingStep } from '@/hooks/useOnboarding'

interface OnboardingProgressProps {
  progress: number
  currentStep: OnboardingStep
}

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: 'Welcome',
  building_blocks: 'How It Works',
  tasks: 'Tasks',
  projects: 'Projects',
  routines: 'Routines',
  family: 'Family',
  assign: 'Assignments',
  triage: 'Triage',
  today: 'Preview',
  complete: 'Complete',
}

export function OnboardingProgress({ progress, currentStep }: OnboardingProgressProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-bg-base/95 backdrop-blur-sm border-b border-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-neutral-500">{STEP_LABELS[currentStep]}</span>
          <span className="text-sm text-neutral-400">{Math.round(progress)}%</span>
        </div>
        <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
