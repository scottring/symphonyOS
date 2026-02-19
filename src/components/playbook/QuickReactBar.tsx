import type { QuickReact } from '@/types/playbook'
import { QUICK_REACT_CONFIG } from '@/types/playbook'

interface QuickReactBarProps {
  selected: QuickReact | null | undefined
  onSelect: (react: QuickReact | null) => void
}

export function QuickReactBar({ selected, onSelect }: QuickReactBarProps) {
  const options: QuickReact[] = ['nailed-it', 'okay', 'tough']

  return (
    <div className="flex items-center gap-2 animate-slide-up">
      <span className="text-xs text-neutral-400 mr-1">How did it go?</span>
      {options.map((react) => {
        const config = QUICK_REACT_CONFIG[react]
        const isSelected = selected === react

        return (
          <button
            key={react}
            onClick={() => onSelect(isSelected ? null : react)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
              isSelected
                ? `${config.bgColor} ${config.color} border-current`
                : 'bg-transparent text-neutral-500 border-neutral-200 hover:border-neutral-400 hover:text-neutral-600'
            }`}
          >
            <span>{config.emoji}</span>
            <span>{config.label}</span>
          </button>
        )
      })}
    </div>
  )
}
