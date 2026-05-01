import type { PantryLevel } from '@/types/meal-planner'

interface Props {
  level: PantryLevel | null
  onSelect: (level: PantryLevel) => void
  /** Optional context line, e.g. "marked high 8 days ago — used in 4 recipes since" */
  context?: string
}

const LEVELS: Array<{ key: PantryLevel; label: string; tone: string }> = [
  { key: 'high',   label: 'H', tone: 'bg-sage-100 text-sage-700' },
  { key: 'medium', label: 'M', tone: 'bg-neutral-100 text-neutral-600' },
  { key: 'low',    label: 'L', tone: 'bg-amber-100 text-amber-700' },
]

/** Three-state inline level picker for pantry items. Tone reflects
 *  "have plenty" → "buy now". The fourth state ('out') is implicit:
 *  unset means out / unknown. */
export function PantryLevelPicker({ level, onSelect, context }: Props) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex gap-1">
        {LEVELS.map(({ key, label, tone }) => (
          <button
            key={key}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(key) }}
            title={`Mark ${key}`}
            aria-label={`Mark ${key}`}
            className={`h-5 w-5 rounded text-[10px] font-bold transition-opacity ${level === key ? tone : 'bg-neutral-50 text-neutral-300 hover:opacity-70'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {context && (
        <div className="text-[10px] italic text-neutral-400 max-w-[180px] text-right truncate" title={context}>
          {context}
        </div>
      )}
    </div>
  )
}
