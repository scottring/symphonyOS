interface Props {
  onPasteUrl: () => void
  onManualEntry: () => void
}

export function AddRecipeButton({ onPasteUrl, onManualEntry }: Props) {
  return (
    <div className="flex gap-3">
      <button onClick={onManualEntry}
              className="px-5 py-2 rounded-full border border-neutral-300 text-neutral-700 text-[14px] font-medium hover:bg-neutral-100">
        + Manual entry
      </button>
      <button onClick={onPasteUrl}
              className="px-5 py-2 rounded-full bg-neutral-800 text-white text-[14px] font-medium hover:bg-neutral-900">
        Paste recipe URL
      </button>
    </div>
  )
}
