import { useState, useMemo } from 'react'
import { searchRecipes } from '@/lib/recipes/search'
import { useRecipes } from '@/hooks/useRecipes'
import { RecipeCard } from './RecipeCard'
import { ShelfFilterRow } from './ShelfFilterRow'
import { AddRecipeButton } from './AddRecipeButton'
import { RecipeUrlPasteDialog } from './RecipeUrlPasteDialog'
import { RecipeManualEditor } from './RecipeManualEditor'
import { RecipeDetailModal } from './RecipeDetailModal'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { MealsTabs } from '../MealsTabs'

export function MemoryShelfPage() {
  const { recipes, loading, error, filter, setFilter, addByUrl, addManual } = useRecipes()
  const [pasteOpen, setPasteOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // The same matcher the wall uses (src/lib/recipes/search.ts), with the
  // deeper net this page has always cast. It used to be an unranked
  // `includes` sweep: typing "sal" listed whatever order the shelf was in,
  // with a recipe that merely contains salt level with "Salmon burgers".
  // Ranking is what's shared; the keyboard is not — a desktop has one.
  const visibleRecipes = useMemo(() => {
    if (!search.trim()) return recipes
    const ranked = searchRecipes(
      recipes.map(r => ({
        id: r.id, title: r.title, tags: r.tags,
        lastCookedAt: r.lastCookedAt ?? null, prepMinutes: r.prepMinutes ?? null,
        ingredients: r.ingredients, sourceLabel: r.sourceLabel,
        acceptanceSentence: r.acceptanceSentence,
      })),
      search,
      { deep: true },
    )
    const byId = new Map(recipes.map(r => [r.id, r]))
    return ranked.map(r => byId.get(r.id)!).filter(Boolean)
  }, [recipes, search])

  const handleAddByUrl = async (url: string) => {
    await addByUrl(url)
  }

  const handleAddManual = async (input: Parameters<typeof addManual>[0]) => {
    await addManual(input)
  }

  return (
    <div className={PAGE_COLUMN_WIDE}>
      <MastheadCard
        title={<>What we cook <span className="italic text-primary-600">together.</span></>}
        motif="meals"
        eyebrow={
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Memory shelf · {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
          </span>
        }
        subline={<MealsTabs className="-mb-1" />}
        footer={
          <AddRecipeButton
            onPasteUrl={() => setPasteOpen(true)}
            onManualEntry={() => setManualOpen(true)}
          />
        }
      />

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
      <RecipeDetailModal
        recipeId={detailRecipeId}
        onClose={() => setDetailRecipeId(null)}
      />
    </div>
  )
}
