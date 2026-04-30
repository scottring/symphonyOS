import { useState } from 'react'
import { useRecipes } from '@/hooks/useRecipes'
import { RecipeCard } from './RecipeCard'
import { ShelfFilterRow } from './ShelfFilterRow'
import { AddRecipeButton } from './AddRecipeButton'
import { RecipeUrlPasteDialog } from './RecipeUrlPasteDialog'
import { RecipeManualEditor } from './RecipeManualEditor'
import { RecipeDetailModal } from './RecipeDetailModal'
import { MealsTabs } from '../MealsTabs'

export function MemoryShelfPage() {
  const { recipes, loading, error, filter, setFilter, addByUrl, addManual } = useRecipes()
  const [pasteOpen, setPasteOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null)

  const handleAddByUrl = async (url: string) => {
    await addByUrl(url)
  }

  const handleAddManual = async (input: Parameters<typeof addManual>[0]) => {
    await addManual(input)
  }

  return (
    <div className="px-12 py-12 max-w-6xl mx-auto">
      <MealsTabs />
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">
            MEMORY SHELF · {recipes.length} {recipes.length === 1 ? 'RECIPE' : 'RECIPES'}
          </div>
          <h1 className="font-display text-[3.25rem] leading-[1.05] text-neutral-800">
            What we cook <span className="italic text-primary-500">together.</span>
          </h1>
          <p className="font-display italic text-[1.25rem] text-neutral-500 mt-3">
            Default sort: recently cooked.
          </p>
        </div>
        <AddRecipeButton onPasteUrl={() => setPasteOpen(true)} onManualEntry={() => setManualOpen(true)} />
      </div>

      <ShelfFilterRow active={filter} onChange={setFilter} />

      {loading && (
        <div className="py-24 text-center text-[12px] uppercase tracking-widest text-neutral-400">
          Loading…
        </div>
      )}
      {error && (
        <div className="py-12 text-center text-accent-500">{error}</div>
      )}
      {!loading && !error && recipes.length === 0 && (
        <div className="py-24 text-center">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-3">
            EMPTY SHELF
          </div>
          <h2 className="font-display text-3xl text-neutral-700">
            No recipes saved yet — paste an NYT Cooking URL to start.
          </h2>
        </div>
      )}
      {!loading && recipes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 mt-8">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onClick={(r) => setDetailRecipeId(r.id)} />
          ))}
        </div>
      )}

      <RecipeUrlPasteDialog
        isOpen={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSave={handleAddByUrl}
        onSwitchToManual={() => setManualOpen(true)}
      />
      <RecipeManualEditor
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        onSave={handleAddManual}
      />
      <RecipeDetailModal
        recipeId={detailRecipeId}
        onClose={() => setDetailRecipeId(null)}
      />
    </div>
  )
}
