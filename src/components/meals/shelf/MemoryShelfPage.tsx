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
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageSearch } from '@/components/layout/PageSearch'
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
    <div className={PAGE_COLUMN}>
      <MastheadCard
        variant="page"
        title={<>What we cook <span className="italic text-primary-600">together.</span></>}
        motif="meals"
        eyebrow={
          // pl-1.5 undoes the eyebrow slot's -ml-1.5 (meant for caret navs);
          // without it the phone overflow rule clipped the first letter.
          <span className="inline-block pl-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Memory shelf · {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
          </span>
        }
        subline={<MealsTabs className="-mb-1" />}
        footer={
          <>
            <AddRecipeButton
              onPasteUrl={() => setPasteOpen(true)}
              onManualEntry={() => setManualOpen(true)}
            />
            {/* The page's search, compact in the tools row like Notes' and
                Contacts' — it searches titles, tags and ingredients. */}
            <PageSearch value={search} onChange={setSearch} placeholder="Search the shelf…" ariaLabel="Search the shelf — title, tags, ingredients" />
          </>
        }
      />

      <ShelfFilterRow active={filter} onChange={setFilter} />

      {loading && (
        <p className="py-4 text-[14px] text-neutral-400">Loading…</p>
      )}
      {error && (
        <p className="py-4 text-[14px] text-accent-500">{error}</p>
      )}
      {!loading && !error && recipes.length === 0 && (
        <EmptyState title="No recipes saved yet.">
          Paste an NYT Cooking link or write one in by hand, from the + above.
        </EmptyState>
      )}
      {!loading && recipes.length > 0 && visibleRecipes.length === 0 && (
        <EmptyState
          title={<>Nothing matches “{search}”.</>}
          action={
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded-md px-3 py-2 text-[14px] text-primary-700 transition-colors hover:bg-primary-50"
            >
              Clear the search
            </button>
          }
        >
          The shelf searches titles, tags and ingredients.
        </EmptyState>
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
