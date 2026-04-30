interface Props {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

/**
 * Primary-teal pill button anchored bottom-right of the cook page.
 * Bumps `recipes.times_cooked` and navigates back to the plan.
 */
export function MarkDoneButton({ onClick, disabled, loading }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="rounded-full bg-primary-500 px-7 py-3 text-[14px] font-medium text-white shadow-card transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? 'Saving…' : 'Mark as done'}
    </button>
  )
}
