import { useState, useMemo } from 'react'
import { useRecipes } from '@/hooks/useRecipes'
import { RecipeCard } from './RecipeCard'
import { ShelfFilterRow } from './ShelfFilterRow'
import { AddRecipeButton } from './AddRecipeButton'
import { RecipeUrlPasteDialog } from './RecipeUrlPasteDialog'
import { RecipeManualEditor } from './RecipeManualEditor'
import { RecipeDetailModal } from './RecipeDetailModal'
import { RecipeDiscoverDialog, type DiscoveredRecipe } from './RecipeDiscoverDialog'
import { MealsTabs } from '../MealsTabs'

export function MemoryShelfPage() {
  const { recipes, loading, error, filter, setFilter, addByUrl, addManual } = useRecipes()
  const [pasteOpen, setPasteOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Search across title, tags, ingredients, source label, and acceptance sentence.
  const visibleRecipes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(r => {
      if (r.title.toLowerCase().includes(q)) return true
      if (r.sourceLabel?.toLowerCase().includes(q)) return true
      if (r.acceptanceSentence?.toLowerCase().includes(q)) return true
      if (r.tags.some(t => t.toLowerCase().includes(q))) return true
      if (r.ingredients.some(i => i.toLowerCase().includes(q))) return true
      return false
    })
  }, [recipes, search])

  const handleAddByUrl = async (url: string) => {
    await addByUrl(url)
  }

  const handleAddManual = async (input: Parameters<typeof addManual>[0]) => {
    await addManual(input)
  }

  const handleSaveDiscovered = async (recipe: DiscoveredRecipe) => {
    await addManual({
      title: recipe.title,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      prepMinutes: recipe.prep_minutes,
      sourceLabel: 'Symphony AI',
      tags: recipe.tags,
      acceptanceSentence: recipe.acceptance_sentence,
      isPrepFriendly: recipe.is_prep_friendly,
    })
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
        <AddRecipeButton
          onPasteUrl={() => setPasteOpen(true)}
          onManualEntry={() => setManualOpen(true)}
          onFindRecipe={() => setDiscoverOpen(true)}
        />
      </div>

      <div className="mb-5 relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search the shelf — title, tags, ingredients…"
          className="w-full pl-10 pr-10 py-2.5 rounded-2xl border border-neutral-200 bg-bg-base text-[14px] focus:outline-none focus:border-primary-500"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-[15px]" aria-hidden>⌕</span>
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-[14px]"
          >×</button>
        )}
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
      {!loading && recipes.length > 0 && visibleRecipes.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-display italic text-[1rem] text-neutral-400">
            Nothing matches "{search}". <button onClick={() => setSearch('')} className="text-primary-500 underline">Clear</button>
          </p>
        </div>
      )}
      {!loading && visibleRecipes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 mt-8">
          {visibleRecipes.map((recipe) => (
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
      <RecipeDiscoverDialog
        isOpen={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        onSave={handleSaveDiscovered}
      />
      <RecipeDetailModal
        recipeId={detailRecipeId}
        onClose={() => setDetailRecipeId(null)}
      />
    </div>
  )
}
