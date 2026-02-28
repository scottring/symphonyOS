import type { ContextViewProps } from './types'

export function PlaceholderContextView({ data, onDismiss }: ContextViewProps) {
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
