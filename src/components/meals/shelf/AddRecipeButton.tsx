import { useEffect, useRef, useState } from 'react'

interface Props {
  onPasteUrl: () => void
  onManualEntry: () => void
  onFindRecipe: () => void
}

/** A single + button that fans out three add-recipe options on click. */
export function AddRecipeButton({ onPasteUrl, onManualEntry, onFindRecipe }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close add-recipe menu' : 'Add a recipe'}
        aria-expanded={open}
        className={`text-[28px] leading-none font-light text-neutral-400 hover:text-primary-500 transition-all ${open ? 'rotate-45 text-primary-500' : ''}`}
      >
        +
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-[260px] rounded-2xl border border-neutral-200 bg-bg-elevated shadow-elevated overflow-hidden">
          <button
            onClick={choose(onFindRecipe)}
            className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-primary-50 transition-colors"
          >
            <span className="text-primary-500 text-[16px] leading-none mt-0.5">✦</span>
            <div className="flex-1">
              <div className="text-[14px] font-medium text-neutral-800">Find a recipe</div>
              <div className="text-[12px] italic text-neutral-500 mt-0.5">Symphony AI suggests three</div>
            </div>
          </button>

          <div className="border-t border-neutral-100" />

          <button
            onClick={choose(onPasteUrl)}
            className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-neutral-50 transition-colors"
          >
            <span className="text-neutral-500 text-[14px] leading-none mt-0.5">↗</span>
            <div className="flex-1">
              <div className="text-[14px] font-medium text-neutral-800">Paste a URL</div>
              <div className="text-[12px] italic text-neutral-500 mt-0.5">From any recipe site</div>
            </div>
          </button>

          <div className="border-t border-neutral-100" />

          <button
            onClick={choose(onManualEntry)}
            className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-neutral-50 transition-colors"
          >
            <span className="text-neutral-500 text-[14px] leading-none mt-0.5">✎</span>
            <div className="flex-1">
              <div className="text-[14px] font-medium text-neutral-800">Manual entry</div>
              <div className="text-[12px] italic text-neutral-500 mt-0.5">Type it yourself</div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
