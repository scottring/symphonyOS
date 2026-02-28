import type { ContextViewProps } from './types'

const VIEW_INFO: Record<string, { title: string; icon: string; description: string; color: string }> = {
  'morning-launch': {
    title: 'Morning Launch',
    icon: '🚀',
    description: 'School prep checklist, bus countdown, what everyone needs today',
    color: '#F9C35C',
  },
  'after-school': {
    title: 'After School',
    icon: '🎒',
    description: 'Activities, homework tracker, snack ideas',
    color: '#60A5FA',
  },
  'bedtime': {
    title: 'Bedtime',
    icon: '🌙',
    description: 'Routine steps for Ella and Kaleb, tomorrow preview',
    color: '#A78BFA',
  },
  'weekend-morning': {
    title: 'Weekend Plan',
    icon: '☀️',
    description: 'Family activities, meal plan, chore assignments',
    color: '#F9C35C',
  },
}

export function PlaceholderContextView({ data, onDismiss }: ContextViewProps) {
  // This is a placeholder for views not yet built
  // We don't know the viewId here, so show a generic placeholder
  void data

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-lg">
        <div className="text-[5rem] mb-6">🚧</div>
        <h2 className="text-white font-black text-[2rem] uppercase tracking-wider mb-4">
          Coming Soon
        </h2>
        <p className="text-white/50 text-[1.2rem] font-medium mb-8">
          This contextual view is being built. Tap back to return to the main display.
        </p>
        <button
          onClick={onDismiss}
          className="px-8 py-4 rounded-xl bg-white/10 border border-white/20
            text-white font-bold text-[1.1rem] uppercase tracking-wider
            hover:bg-white/15 transition-all"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
