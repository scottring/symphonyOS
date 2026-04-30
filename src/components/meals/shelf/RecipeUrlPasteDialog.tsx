import { useState } from 'react'
import { fetchRecipe, type RecipeData } from '@/lib/recipeParser'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (url: string) => Promise<void>
  onSwitchToManual?: () => void
}

export function RecipeUrlPasteDialog({ isOpen, onClose, onSave, onSwitchToManual }: Props) {
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<RecipeData | null>(null)
  const [step, setStep] = useState<'paste' | 'preview' | 'saving'>('paste')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleFetch = async () => {
    setError(null)
    setStep('saving')
    try {
      const data = await fetchRecipe(url)
      setPreview(data)
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch recipe')
      setStep('paste')
    }
  }

  const handleSave = async () => {
    setStep('saving')
    setError(null)
    try {
      await onSave(url)
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setStep('preview')
    }
  }

  const handleClose = () => {
    setUrl(''); setPreview(null); setStep('paste'); setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-bg-elevated rounded-3xl shadow-elevated max-w-2xl w-full mx-6 p-10" onClick={(e) => e.stopPropagation()}>
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-3">
          PASTE A RECIPE URL
        </div>
        <h2 className="font-display text-4xl text-neutral-800 mb-6">
          What are we <span className="italic text-primary-500">cooking?</span>
        </h2>

        {step === 'paste' && (
          <>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…  any recipe site (NYT, Smitten Kitchen, AllRecipes, etc.)"
              className="w-full px-5 py-3 rounded-2xl border border-neutral-200 bg-bg-base text-[16px] focus:outline-none focus:border-primary-500"
              autoFocus
            />
            {error && (
              <div className="mt-3 space-y-2">
                <p className="text-[14px] text-accent-500">{error}</p>
                {onSwitchToManual && /403|404|429|503|blocks automated/i.test(error) && (
                  <button
                    onClick={() => { handleClose(); onSwitchToManual() }}
                    className="text-[13px] italic text-primary-500 hover:text-primary-600 underline"
                  >
                    Switch to manual entry →
                  </button>
                )}
              </div>
            )}
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={handleClose} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">
                Cancel
              </button>
              <button onClick={handleFetch} disabled={!url}
                className="px-6 py-2 rounded-2xl bg-primary-500 text-white font-medium disabled:opacity-40 hover:bg-primary-600">
                Fetch recipe
              </button>
            </div>
          </>
        )}

        {step === 'preview' && preview && (
          <>
            <div className="space-y-3">
              <h3 className="font-display text-2xl text-neutral-800">{preview.title}</h3>
              <p className="text-[14px] text-neutral-500">
                {preview.ingredients.length} ingredients · {preview.instructions.length} steps
                {preview.totalTime && ` · ${preview.totalTime}`}
              </p>
              <div className="text-[13px] text-neutral-600 max-h-32 overflow-y-auto">
                {preview.ingredients.slice(0, 6).map((ing, i) => <div key={i}>· {ing}</div>)}
                {preview.ingredients.length > 6 && <div>… and {preview.ingredients.length - 6} more</div>}
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={() => setStep('paste')} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">
                Back
              </button>
              <button onClick={handleSave} className="px-6 py-2 rounded-2xl bg-primary-500 text-white font-medium hover:bg-primary-600">
                Save to shelf
              </button>
            </div>
          </>
        )}

        {step === 'saving' && (
          <div className="py-8 text-center text-neutral-500">
            <div className="text-[0.85rem] font-bold uppercase tracking-widest">Working…</div>
          </div>
        )}
      </div>
    </div>
  )
}
