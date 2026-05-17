import { RHYTHM_MODES, RHYTHM_MODE_LABELS, type RhythmMode } from './rhythm/rhythmMode'

interface WallRhythmBarProps {
  currentMode: RhythmMode
  overrideMode: RhythmMode | null
  onSelectMode: (mode: RhythmMode | null) => void
}

export function WallRhythmBar({ currentMode, overrideMode, onSelectMode }: WallRhythmBarProps) {
  return (
    <div className="flex items-stretch gap-1 mt-3">
      {RHYTHM_MODES.map((m) => {
        const { label, window } = RHYTHM_MODE_LABELS[m]
        const active = m === currentMode
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            aria-label={label}
            onClick={() => onSelectMode(m)}
            className={`
              flex-1 rounded-md px-2 py-2 text-center transition-colors
              ${active
                ? 'bg-emerald-900/60 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10'}
            `}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-70">{window}</div>
            <div className="text-xs font-medium">{label}</div>
          </button>
        )
      })}
      {overrideMode && (
        <button
          type="button"
          aria-label="Now"
          onClick={() => onSelectMode(null)}
          className="rounded-md px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 transition-colors"
        >
          Now
        </button>
      )}
    </div>
  )
}
