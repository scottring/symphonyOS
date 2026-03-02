import { useState, useEffect, useMemo, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { fetchRecipe, formatIngredientNarrative, toNarrativeStep } from '@/lib/recipeParser'
import type { RecipeData } from '@/lib/recipeParser'

interface WallRecipeViewerProps {
  url: string
  mealName: string
  mealIcon: string
  onClose: () => void
}

export function WallRecipeViewer({ url, mealName, mealIcon, onClose }: WallRecipeViewerProps) {
  const [recipe, setRecipe] = useState<RecipeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set())
  const [visible, setVisible] = useState(false)

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(timer)
  }, [])

  // Escape key to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && recipe) {
        setCurrentStep(s => Math.min(recipe.instructions.length - 1, s + 1))
      }
      if (e.key === 'ArrowLeft') {
        setCurrentStep(s => Math.max(0, s - 1))
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, recipe])

  // Fetch recipe
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const parsed = await fetchRecipe(url)
        setRecipe(parsed)
      } catch (err) {
        console.error('Wall recipe fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load recipe')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [url])

  const parsedIngredients = useMemo(() => {
    if (!recipe) return []
    return recipe.ingredients.map(formatIngredientNarrative)
  }, [recipe])

  const narrativeSteps = useMemo(() => {
    if (!recipe) return []
    return recipe.instructions.map((step) => toNarrativeStep(step, recipe.ingredients))
  }, [recipe])

  const toggleIngredient = useCallback((idx: number) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }, [])

  // ── Loading state ──
  if (loading) {
    return (
      <div className={`absolute inset-0 z-50 transition-all duration-400 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-[#0f172a]/95" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[4rem] mb-4">{mealIcon}</div>
            <h2 className="text-white font-bold text-[2rem] mb-2">{mealName}</h2>
            <div className="flex items-center gap-3 text-white/40">
              <div className="w-2 h-2 rounded-full bg-[#6DC4A7] animate-pulse" />
              <span className="text-[1.2rem] font-bold uppercase tracking-widest">Loading Recipe</span>
              <div className="w-2 h-2 rounded-full bg-[#6DC4A7] animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>
    )
  }

  // ── Error state ──
  if (error || !recipe) {
    return (
      <div className={`absolute inset-0 z-50 transition-all duration-400 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-[#0f172a]/95" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center max-w-lg">
            <div className="text-[4rem] mb-4">{mealIcon}</div>
            <h2 className="text-white font-bold text-[2rem] mb-3">{mealName}</h2>
            <p className="text-white/50 text-[1.2rem] mb-6">
              {error || 'Could not load recipe from this URL.'}
            </p>
            <button
              onClick={onClose}
              className="px-8 py-3 rounded-xl bg-white/10 border border-white/20
                text-white font-bold text-[1.1rem] uppercase tracking-wider
                hover:bg-white/15 transition-all"
            >
              Back
            </button>
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>
    )
  }

  // ── Main split-screen view ──
  return (
    <div className={`absolute inset-0 z-50 transition-all duration-500 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0f172a]/97" />

      {/* Content */}
      <div className={`absolute inset-0 transition-all duration-500 ease-out ${visible ? 'translate-y-0 scale-100' : 'translate-y-4 scale-[0.98]'}`}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-12 pt-8 pb-4 relative z-10">
          <CloseButton onClick={onClose} />

          <div className="flex items-center gap-4">
            <span className="text-[2.5rem]">{mealIcon}</span>
            <div>
              <h1 className="text-white font-black text-[2rem] leading-tight uppercase tracking-wider">
                {recipe.title}
              </h1>
              <div className="flex items-center gap-4 mt-1">
                {recipe.totalTime && (
                  <span className="text-white/40 font-bold text-[1rem] flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {recipe.totalTime}
                  </span>
                )}
                {recipe.servings && (
                  <span className="text-white/40 font-bold text-[1rem]">
                    Serves {recipe.servings}
                  </span>
                )}
                <span className="text-white/20 font-bold text-[0.85rem]">
                  {recipe.source}
                </span>
              </div>
            </div>
          </div>

          {/* Step counter */}
          {narrativeSteps.length > 0 && (
            <div className="text-white/30 font-black text-[1rem] uppercase tracking-widest">
              Step {currentStep + 1} / {narrativeSteps.length}
            </div>
          )}
        </div>

        {/* ── Split Screen Body ── */}
        <div className="flex gap-0 px-12 pb-8 h-[calc(100%-120px)]">

          {/* ─── LEFT: Ingredients ─── */}
          <div className="w-[35%] h-full flex flex-col pr-8">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[1.6rem]">🧺</span>
              <h2 className="text-[#6DC4A7] font-black text-[1.4rem] uppercase tracking-widest">
                Ingredients
              </h2>
              <span className="text-white/20 font-bold text-[0.9rem] ml-auto">
                {checkedIngredients.size}/{parsedIngredients.length}
              </span>
            </div>

            {/* Scrollable ingredients list */}
            <div className="flex-1 overflow-y-auto space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              {parsedIngredients.map((ing, i) => {
                const isChecked = checkedIngredients.has(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggleIngredient(i)}
                    className={`
                      w-full flex items-center gap-4 px-5 py-3.5 rounded-xl text-left
                      transition-all duration-200 select-none
                      ${isChecked
                        ? 'bg-[#6DC4A7]/10 border border-[#6DC4A7]/20'
                        : 'bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07]'
                      }
                    `}
                  >
                    {/* Checkbox */}
                    <div className={`
                      w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                      transition-all duration-200
                      ${isChecked
                        ? 'bg-[#6DC4A7] border-2 border-[#6DC4A7]'
                        : 'border-2 border-white/20'
                      }
                    `}>
                      {isChecked && (
                        <svg className="w-4 h-4 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M2.5 6L5 8.5L9.5 3.5" />
                        </svg>
                      )}
                    </div>

                    {/* Ingredient text */}
                    <div className={`flex-1 transition-all duration-200 ${isChecked ? 'opacity-40' : ''}`}>
                      {ing.amount && (
                        <span className="text-[#6DC4A7] font-black text-[1.15rem]">
                          {ing.amount}{' '}
                        </span>
                      )}
                      <span className={`font-bold text-[1.15rem] ${isChecked ? 'text-white/40 line-through' : 'text-white/80'}`}>
                        {ing.name}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── Divider ─── */}
          <div className="w-px bg-white/[0.08] self-stretch my-4 flex-shrink-0" />

          {/* ─── RIGHT: Steps ─── */}
          <div className="w-[65%] h-full flex flex-col pl-8">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[1.6rem]">👩‍🍳</span>
              <h2 className="text-[#F9C35C] font-black text-[1.4rem] uppercase tracking-widest">
                Directions
              </h2>
            </div>

            {narrativeSteps.length > 0 ? (
              <>
                {/* Current step — large, prominent */}
                <div className="flex-1 flex flex-col">
                  <div className="flex-1 flex items-start gap-6">
                    {/* Step number */}
                    <div className="w-16 h-16 rounded-2xl bg-[#F9C35C] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#0f172a] font-black text-[1.8rem]">
                        {currentStep + 1}
                      </span>
                    </div>

                    {/* Step text */}
                    <div className="flex-1 pt-2">
                      <p
                        className="text-white/90 font-medium text-[1.5rem] leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            narrativeSteps[currentStep].replace(
                              /\*\*([^*]+)\*\*/g,
                              '<strong class="text-[#6DC4A7] font-bold">$1</strong>'
                            )
                          )
                        }}
                      />
                    </div>
                  </div>

                  {/* Step dots / mini timeline */}
                  <div className="flex items-center justify-center gap-2 mt-6 mb-4">
                    {narrativeSteps.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentStep(i)}
                        className={`
                          rounded-full transition-all duration-300
                          ${i === currentStep
                            ? 'w-8 h-3 bg-[#F9C35C]'
                            : i < currentStep
                              ? 'w-3 h-3 bg-[#6DC4A7]/50'
                              : 'w-3 h-3 bg-white/15 hover:bg-white/25'
                          }
                        `}
                        aria-label={`Go to step ${i + 1}`}
                      />
                    ))}
                  </div>

                  {/* Navigation buttons */}
                  <div className="flex items-center justify-between mt-auto pt-4">
                    <button
                      onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                      disabled={currentStep === 0}
                      className={`
                        flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-[1.15rem]
                        uppercase tracking-wider transition-all duration-200
                        ${currentStep === 0
                          ? 'text-white/15 cursor-not-allowed'
                          : 'text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white/80'
                        }
                      `}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                      </svg>
                      Previous
                    </button>

                    <button
                      onClick={() => setCurrentStep(Math.min(narrativeSteps.length - 1, currentStep + 1))}
                      disabled={currentStep === narrativeSteps.length - 1}
                      className={`
                        flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-[1.15rem]
                        uppercase tracking-wider transition-all duration-200
                        ${currentStep === narrativeSteps.length - 1
                          ? 'text-white/15 cursor-not-allowed'
                          : 'bg-[#F9C35C] text-[#0f172a] hover:bg-[#f7b832]'
                        }
                      `}
                    >
                      Next
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-[3rem] block mb-4">📋</span>
                  <p className="text-white/40 text-[1.2rem] font-bold">
                    No step-by-step instructions found.
                  </p>
                  <p className="text-white/25 text-[1rem] mt-2">
                    The recipe page didn't have structured directions.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .duration-400 { transition-duration: 400ms; }
      `}</style>
    </div>
  )
}

// ── Close/Back Button ──

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-5 py-3
        rounded-xl bg-white/8 border border-white/15 backdrop-blur-sm
        text-white/70 hover:text-white hover:bg-white/12
        transition-all duration-200 group z-50"
    >
      <svg
        className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      <span className="font-bold text-[0.9rem] uppercase tracking-wider">Back</span>
    </button>
  )
}
