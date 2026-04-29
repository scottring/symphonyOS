import { useState } from 'react'
import { useRecipes } from '@/hooks/useRecipes'
import { AddRecipeButton } from '../shelf/AddRecipeButton'
import { RecipeUrlPasteDialog } from '../shelf/RecipeUrlPasteDialog'
import { RecipeManualEditor } from '../shelf/RecipeManualEditor'
import type { MealSlot, Recipe } from '@/types/meal-planner'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'

interface Props {
  isOpen: boolean
  slot?: MealSlot
  forLabel?: string
  onClose: () => void
  onPick: (recipeId: string) => void
}

export function RecipePickerModal({ isOpen, slot, forLabel, onClose, onPick }: Props) {
  const { recipes, loading, addByUrl, addManual } = useRecipes()
  const [q, setQ] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  if (!isOpen) return null

  const filtered = q
    ? recipes.filter(r => r.title.toLowerCase().includes(q.toLowerCase()))
    : recipes

  const handleAddByUrl = async (url: string) => {
    await addByUrl(url)
  }

  const handleAddManual = async (input: Parameters<typeof addManual>[0]) => {
    await addManual(input)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-elevated rounded-3xl shadow-elevated max-w-2xl w-full mx-6 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 pb-4 border-b border-neutral-200">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mt-1">
              {slot
                ? `PICK A RECIPE · ${MEAL_SLOT_LABEL[slot].toUpperCase()}${forLabel ? ` · FOR ${forLabel.toUpperCase()}` : ''}`
                : 'PICK A RECIPE'}
            </div>
            <AddRecipeButton onPasteUrl={() => setPasteOpen(true)} onManualEntry={() => setManualOpen(true)} />
          </div>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search your shelf…"
                 className="w-full px-4 py-2 rounded-xl border border-neutral-200 bg-bg-base focus:outline-none focus:border-primary-500"
                 autoFocus />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="py-8 text-center text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-neutral-500">
              {recipes.length === 0
                ? <p>Your shelf is empty — add your first recipe above ↑</p>
                : <p>No recipes match "{q}".</p>}
            </div>
          )}
          {filtered.map((recipe: Recipe) => (
            <button key={recipe.id} onClick={() => { onPick(recipe.id); onClose() }}
                    className="w-full text-left px-5 py-3 rounded-xl hover:bg-neutral-100 transition-colors mb-1">
              <div className="font-display text-[1.25rem] text-neutral-800">{recipe.title}</div>
              {recipe.acceptanceSentence && (
                <div className="font-display italic text-[14px] text-sage-500 mt-0.5">{recipe.acceptanceSentence}</div>
              )}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-neutral-200 text-right">
          <button onClick={onClose} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">Cancel</button>
        </div>
      </div>

      {/* Nested overlays — render with higher effective z by virtue of being later in DOM */}
      <RecipeUrlPasteDialog
        isOpen={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSave={handleAddByUrl}
      />
      <RecipeManualEditor
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        onSave={handleAddManual}
      />
    </div>
  )
}
