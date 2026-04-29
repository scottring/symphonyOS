interface Props {
  index: number
  text: string
  checked: boolean
  onToggle: () => void
}

/**
 * A single numbered cooking step. Click anywhere on the row to mark it
 * complete — strikes through and dims when checked.
 */
export function StepRow({ index, text, checked, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="group flex w-full items-start gap-4 py-3 text-left transition-opacity"
    >
      <span
        className={`flex-shrink-0 font-display text-[1.25rem] leading-tight tabular-nums ${
          checked ? 'text-neutral-300' : 'text-primary-500'
        }`}
      >
        {index + 1}.
      </span>
      <span
        className={`flex-1 text-[15px] leading-relaxed transition-all ${
          checked
            ? 'text-neutral-400 line-through decoration-neutral-300'
            : 'text-neutral-700 group-hover:text-neutral-800'
        }`}
      >
        {text}
      </span>
    </button>
  )
}
