import { useState } from 'react'
import { useRecipe } from '@/hooks/useRecipe'

interface Props {
  recipeId: string | null
  onClose: () => void
}

export function RecipeDetailModal({ recipeId, onClose }: Props) {
  const { recipe, loading, error, updateAcceptance, recordCooked } = useRecipe(recipeId)
  const [editingAcceptance, setEditingAcceptance] = useState(false)
  const [draftSentence, setDraftSentence] = useState('')

  if (!recipeId) return null

  const handleSaveAcceptance = async () => {
    if (!recipe) return
    await updateAcceptance({ kidAcceptance: recipe.kidAcceptance, sentence: draftSentence })
    setEditingAcceptance(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-elevated rounded-3xl shadow-elevated max-w-3xl w-full mx-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {loading && <div className="p-12 text-center text-neutral-500 uppercase tracking-widest text-[12px]">Loading…</div>}
        {error && <div className="p-12 text-center text-accent-500">{error}</div>}
        {recipe && (
          <>
            {recipe.imageUrl && (
              <div className="aspect-[16/9] bg-neutral-100 rounded-t-3xl overflow-hidden">
                <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-10">
              <div className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-2">
                {recipe.sourceLabel ?? 'MANUAL ENTRY'}
                {recipe.prepMinutes != null && ` · ${recipe.prepMinutes} MIN`}
              </div>
              <h2 className="font-display text-4xl text-neutral-800 mb-4">{recipe.title}</h2>

              <div className="bg-review-50 border border-review-100 rounded-2xl p-5 mb-6">
                <div className="text-[10px] font-bold uppercase tracking-widest text-review-600 mb-2">KIDS</div>
                {!editingAcceptance ? (
                  <>
                    <p className="font-display italic text-[16px] text-sage-500">
                      {recipe.acceptanceSentence ?? <span className="text-neutral-400">No notes yet.</span>}
                    </p>
                    <button onClick={() => { setDraftSentence(recipe.acceptanceSentence ?? ''); setEditingAcceptance(true) }}
                            className="mt-3 text-[12px] uppercase tracking-wider font-bold text-review-600 hover:text-review-700">
                      Edit sentence
                    </button>
                  </>
                ) : (
                  <>
                    <textarea value={draftSentence} onChange={(e) => setDraftSentence(e.target.value)}
                              placeholder="e.g. Both kids love this. / Kaleb negotiates."
                              rows={2}
                              className="w-full px-4 py-2 rounded-xl border border-neutral-200 bg-bg-base focus:outline-none focus:border-primary-500" />
                    <div className="mt-3 flex gap-2">
                      <button onClick={handleSaveAcceptance} className="px-4 py-1.5 rounded-full bg-primary-500 text-white text-[12px] font-bold uppercase tracking-wider">Save</button>
                      <button onClick={() => setEditingAcceptance(false)} className="px-4 py-1.5 rounded-full text-neutral-600 text-[12px] font-bold uppercase tracking-wider hover:bg-neutral-100">Cancel</button>
                    </div>
                  </>
                )}
              </div>

              <div className="mb-6">
                <div className="text-[12px] font-bold uppercase tracking-widest text-neutral-500 mb-3">INGREDIENTS</div>
                <ul className="space-y-1 text-[15px] text-neutral-700">
                  {recipe.ingredients.map((ing, i) => <li key={i}>· {ing}</li>)}
                </ul>
              </div>

              {recipe.instructions.length > 0 && (
                <div className="mb-6">
                  <div className="text-[12px] font-bold uppercase tracking-widest text-neutral-500 mb-3">STEPS</div>
                  <ol className="space-y-2 text-[15px] text-neutral-700 list-decimal list-inside">
                    {recipe.instructions.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button onClick={() => recordCooked()}
                        className="px-6 py-2.5 rounded-full bg-primary-500 text-white text-[14px] font-medium hover:bg-primary-600">
                  Cooked tonight
                </button>
                <button onClick={onClose} className="px-5 py-2.5 rounded-full text-neutral-600 hover:bg-neutral-100 text-[14px]">
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
