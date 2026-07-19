import { useState, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useRecipes, type ManualRecipeInput } from '@/hooks/useRecipes'
import { useMealSlotSuggestions, type SlotSuggestion } from '@/hooks/useMealSlotSuggestions'
import { AddRecipeButton } from '../shelf/AddRecipeButton'
import { RecipeUrlPasteDialog } from '../shelf/RecipeUrlPasteDialog'
import { RecipeManualEditor } from '../shelf/RecipeManualEditor'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'

export interface LeftoverCandidate {
  /** The parent entry being referenced. */
  entry: MealPlanEntry
  /** Resolved recipe (for title), if the parent has a recipe_id. */
  recipe?: Recipe
  /** Display label for "from X" — e.g. "Sun batch" or "Tue dinner". */
  dayLabel: string
}

interface Props {
  isOpen: boolean
  slot?: MealSlot
  initialFamilyMemberId?: string
  familyMembers: FamilyMember[]
  leftoverCandidates?: LeftoverCandidate[]
  /** Week + day being edited. When both (and slot) are set, the "✨ Ideas" tab
   *  is available; without them the AI tab is hidden (other callers unaffected). */
  weekStart?: Date
  dayOfWeek?: number
  onClose: () => void
  onPick: (recipeId: string, familyMemberId: string | null) => void
  onPickLeftover?: (parentEntryId: string, familyMemberId: string | null) => void
  /** Apply an AI-invented recipe: save it then fill the slot. */
  onApplyNewRecipe?: (input: ManualRecipeInput) => void | Promise<void>
}

export function RecipePickerModal({
  isOpen, slot, initialFamilyMemberId, familyMembers,
  leftoverCandidates = [],
  weekStart, dayOfWeek,
  onClose, onPick, onPickLeftover, onApplyNewRecipe,
}: Props) {
  const { recipes, loading, addByUrl, addManual } = useRecipes()
  const [q, setQ] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [forWho, setForWho] = useState<string | null>(initialFamilyMemberId ?? null)
  const [tab, setTab] = useState<'shelf' | 'leftovers' | 'ideas'>('shelf')
  const [intent, setIntent] = useState('')
  const [applying, setApplying] = useState(false)
  const ai = useMealSlotSuggestions()

  const canSuggest = weekStart != null && dayOfWeek != null && slot != null

  useEffect(() => {
    if (isOpen) {
      setForWho(initialFamilyMemberId ?? null)
      setTab('shelf')
      setIntent('')
      ai.reset()
    }
  // ai.reset is stable; intentionally not depended on to avoid resetting mid-session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFamilyMemberId])

  if (!isOpen) return null

  const runSuggest = () => {
    if (ai.loading || weekStart == null || dayOfWeek == null || slot == null) return
    void ai.suggest({ weekStart, dayOfWeek, slot, intent })
  }

  const applySuggestion = async (s: SlotSuggestion) => {
    if (applying) return
    if (s.source === 'shelf') {
      onPick(s.recipeId, forWho)
      onClose()
      return
    }
    if (!onApplyNewRecipe) return
    setApplying(true)
    try {
      await onApplyNewRecipe({
        title: s.title,
        ingredients: s.ingredients,
        instructions: s.instructions,
        prepMinutes: s.prepMinutes,
        tags: s.tags,
        acceptanceSentence: s.why,
      })
      onClose()
    } finally {
      setApplying(false)
    }
  }

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
              {slot ? `PICK A RECIPE · ${MEAL_SLOT_LABEL[slot].toUpperCase()}` : 'PICK A RECIPE'}
            </div>
            <AddRecipeButton onPasteUrl={() => setPasteOpen(true)} onManualEntry={() => setManualOpen(true)} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 mr-1">for:</span>
            <button
              onClick={() => setForWho(null)}
              className={`px-2.5 py-1 rounded-full text-[12px] transition-colors ${
                forWho === null
                  ? 'bg-primary-500 text-white border border-primary-500'
                  : 'bg-bg-elevated text-neutral-500 border border-neutral-200 hover:border-neutral-300'
              }`}
            >
              Family
            </button>
            {familyMembers
              .filter(m => m.is_full_user || m.member_type === 'core')
              .map(m => (
                <button
                  key={m.id}
                  onClick={() => setForWho(m.id)}
                  className={`px-2.5 py-1 rounded-full text-[12px] transition-colors ${
                    forWho === m.id
                      ? 'bg-primary-500 text-white border border-primary-500'
                      : 'bg-bg-elevated text-neutral-500 border border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  {m.name}
                </button>
              ))}
          </div>
          <div className="flex items-center gap-1 mb-3 border-b border-neutral-200">
            <button
              onClick={() => setTab('shelf')}
              className={`px-3 py-2 text-[12px] -mb-px border-b-2 ${
                tab === 'shelf'
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >From shelf</button>
            {leftoverCandidates.length > 0 && (
              <button
                onClick={() => setTab('leftovers')}
                className={`px-3 py-2 text-[12px] -mb-px border-b-2 ${
                  tab === 'leftovers'
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >Leftovers ({leftoverCandidates.length})</button>
            )}
            {canSuggest && (
              <button
                onClick={() => setTab('ideas')}
                className={`px-3 py-2 text-[12px] -mb-px border-b-2 inline-flex items-center gap-1 ${
                  tab === 'ideas'
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              ><Sparkles className="w-3.5 h-3.5" /> Ideas</button>
            )}
          </div>
          {tab === 'ideas' && (
            <form
              onSubmit={(e) => { e.preventDefault(); runSuggest() }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="What are you in the mood for? (optional)"
                aria-label="Describe what you want"
                className="flex-1 px-4 py-2 rounded-xl border border-neutral-200 bg-bg-base focus:outline-none focus:border-primary-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={ai.loading}
                className="btn-primary px-4 py-2 text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40 shrink-0"
              >
                {ai.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Suggest
              </button>
            </form>
          )}
          {tab === 'shelf' && (
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Search your shelf…"
                   className="w-full px-4 py-2 rounded-xl border border-neutral-200 bg-bg-base focus:outline-none focus:border-primary-500"
                   autoFocus />
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'ideas' ? (
            <div>
              {ai.error && (
                <div className="py-4 text-center text-accent-500 text-[13px]">{ai.error}</div>
              )}
              {ai.loading && (
                <div className="py-12 text-center text-[12px] uppercase tracking-widest text-neutral-400">
                  Thinking of ideas…
                </div>
              )}
              {!ai.loading && !ai.error && ai.suggestions.length === 0 && (
                <div className="py-12 text-center text-neutral-500">
                  <p className="font-display italic">Ask for a few ideas for this slot — describe a craving or just tap Suggest.</p>
                </div>
              )}
              {!ai.loading && ai.suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => void applySuggestion(s)}
                  disabled={applying || (s.source === 'new' && !onApplyNewRecipe)}
                  className="w-full text-left px-5 py-3 rounded-xl hover:bg-neutral-100 transition-colors mb-1 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <div className="font-display text-[1.25rem] text-neutral-800">{s.title}</div>
                    <span className={`text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full ${
                      s.source === 'shelf'
                        ? 'bg-sage-100 text-sage-600'
                        : 'bg-primary-100 text-primary-600'
                    }`}>{s.source === 'shelf' ? 'shelf' : 'new'}</span>
                  </div>
                  {s.why && (
                    <div className="font-display italic text-[14px] text-sage-500 mt-0.5">{s.why}</div>
                  )}
                </button>
              ))}
            </div>
          ) : tab === 'leftovers' ? (
            <div>
              {leftoverCandidates.length === 0 && (
                <div className="py-12 text-center text-neutral-500">
                  <p>No leftover candidates this week.</p>
                </div>
              )}
              {leftoverCandidates.map(c => {
                const title = c.recipe?.title ?? c.entry.adHocTitle ?? '(unnamed)'
                return (
                  <button
                    key={c.entry.id}
                    onClick={() => { onPickLeftover?.(c.entry.id, forWho); onClose() }}
                    className="w-full text-left px-5 py-3 rounded-xl hover:bg-neutral-100 transition-colors mb-1"
                  >
                    <div className="font-display text-[1.15rem] text-neutral-800">{title}</div>
                    <div className="font-display italic text-[12px] text-neutral-500 mt-0.5">from {c.dayLabel}</div>
                  </button>
                )
              })}
            </div>
          ) : (
            <>
              {loading && <div className="py-8 text-center text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>}
              {!loading && filtered.length === 0 && (
                <div className="py-12 text-center text-neutral-500">
                  {recipes.length === 0
                    ? <p>Your shelf is empty — add your first recipe above ↑</p>
                    : <p>No recipes match "{q}".</p>}
                </div>
              )}
              {filtered.map((recipe: Recipe) => (
                <button key={recipe.id} onClick={() => { onPick(recipe.id, forWho); onClose() }}
                        className="w-full text-left px-5 py-3 rounded-xl hover:bg-neutral-100 transition-colors mb-1">
                  <div className="font-display text-[1.25rem] text-neutral-800">{recipe.title}</div>
                  {recipe.acceptanceSentence && (
                    <div className="font-display italic text-[14px] text-sage-500 mt-0.5">{recipe.acceptanceSentence}</div>
                  )}
                </button>
              ))}
            </>
          )}
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
