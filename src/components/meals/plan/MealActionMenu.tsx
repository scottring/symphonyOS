interface Props {
  isOpen: boolean
  onClose: () => void
  onReplace: () => void
  onRemove: () => void
}

export function MealActionMenu({ isOpen, onClose, onReplace, onRemove }: Props) {
  if (!isOpen) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-50 bg-bg-elevated rounded-2xl shadow-elevated border border-neutral-200 py-2 min-w-[180px]">
        <button onClick={() => { onReplace(); onClose() }}
                className="block w-full text-left px-5 py-2 text-[14px] hover:bg-neutral-100">
          Replace recipe
        </button>
        <button onClick={() => { onRemove(); onClose() }}
                className="block w-full text-left px-5 py-2 text-[14px] text-accent-500 hover:bg-neutral-100">
          Remove
        </button>
      </div>
    </>
  )
}
