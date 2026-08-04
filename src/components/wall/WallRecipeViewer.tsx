import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import DOMPurify from 'dompurify'
import { fetchRecipe, formatIngredientNarrative, toNarrativeStep } from '@/lib/recipeParser'
import type { RecipeData } from '@/lib/recipeParser'

/** Swipe must travel this far, and be this much more horizontal than vertical,
 *  before it pages a day. Tuned for a wall-mounted panel, not a phone. */
const SWIPE_MIN_PX = 70
const SWIPE_AXIS_RATIO = 1.5

/** One step of day paging: which day the arrow goes to, and what's cooking there. */
export interface RecipeDayNeighbor {
  /** "Tonight" / "Mon, Aug 3" */
  label: string
  /** The meal name on that day, so the cook knows before tapping. */
  title: string
}

interface WallRecipeViewerProps {
  /** Web recipe URL to fetch + parse. Omit when passing `content` directly. */
  url?: string
  /** Stored recipe content (ingredients/instructions), shown without fetching. */
  content?: { title: string; ingredients: string[]; instructions: string[] }
  mealName: string
  mealIcon: string
  /** Which day is on screen — "Tonight" or "Mon, Aug 3". Omit to hide. */
  dayLabel?: string
  /** Adjacent planned days. `null`/omitted hides that arrow. */
  prevDay?: RecipeDayNeighbor | null
  nextDay?: RecipeDayNeighbor | null
  onPrevDay?: () => void
  onNextDay?: () => void
  onClose: () => void
}

export function WallRecipeViewer({
  url, content, mealName, mealIcon,
  dayLabel, prevDay, nextDay, onPrevDay, onNextDay,
  onClose,
}: WallRecipeViewerProps) {
  const [recipe, setRecipe] = useState<RecipeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set())
  const [visible, setVisible] = useState(false)

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(timer)
  }, [])

  const goPrev = prevDay && onPrevDay ? onPrevDay : null
  const goNext = nextDay && onNextDay ? onNextDay : null

  // Escape closes; left/right page days (a keyboard is only ever attached in
  // dev, but it costs nothing and makes the viewer testable without touch).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev?.()
      else if (e.key === 'ArrowRight') goNext?.()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, goPrev, goNext])

  // Horizontal swipe to page days. The ingredient/step columns scroll
  // vertically, so a swipe only counts when it's decisively sideways —
  // otherwise a slightly-angled scroll would yank the cook to another day.
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    swipeStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_PX) return
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return
    // Swipe left = move forward in time, matching every photo/day carousel.
    if (dx < 0) goNext?.()
    else goPrev?.()
  }, [goPrev, goNext])

  // Load recipe: use stored content directly when provided, otherwise fetch+parse the URL.
  // Ticked-off ingredients belong to the recipe on screen, so paging to another
  // day starts that day's list unchecked.
  useEffect(() => {
    setCheckedIngredients(new Set())
    if (content) {
      setRecipe({
        title: content.title,
        ingredients: content.ingredients,
        instructions: content.instructions,
        source: 'Saved recipe',
      })
      setError(null)
      setLoading(false)
      return
    }
    if (!url) {
      setError('No recipe to show')
      setLoading(false)
      return
    }
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const parsed = await fetchRecipe(url!)
        setRecipe(parsed)
      } catch (err) {
        console.error('Wall recipe fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load recipe')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [url, content])

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

  const hasDayNav = !!(goPrev || goNext)
  // Rendered in every state (loading/error included) so a day with a slow web
  // recipe is never a dead end — you can always page onward.
  const dayNav = hasDayNav ? (
    <>
      {prevDay && goPrev && <DayNavButton side="prev" day={prevDay} onClick={goPrev} />}
      {nextDay && goNext && <DayNavButton side="next" day={nextDay} onClick={goNext} />}
    </>
  ) : null

  // ── Loading state ──
  if (loading) {
    return (
      <div
        className={`absolute inset-0 z-50 transition-all duration-400 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="absolute inset-0 bg-[#0f172a]/95" />
        {dayNav}
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
      <div
        className={`absolute inset-0 z-50 transition-all duration-400 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="absolute inset-0 bg-[#0f172a]/95" />
        {dayNav}
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
    <div
      className={`absolute inset-0 z-50 transition-all duration-500 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0f172a]/97" />
      {dayNav}

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
                {dayLabel && (
                  <span className="text-[#F9C35C] font-black text-[1rem] uppercase tracking-widest">
                    {dayLabel}
                  </span>
                )}
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

          {/* Total step count */}
          {narrativeSteps.length > 0 && (
            <div className="text-white/30 font-black text-[1.1rem] uppercase tracking-widest">
              {narrativeSteps.length} steps
            </div>
          )}
        </div>

        {/* ── Split Screen Body ── */}
        {/* Padded clear of the day-nav rails when they're showing. */}
        <div className={`flex gap-0 pb-8 h-[calc(100%-120px)] ${hasDayNav ? 'px-[168px]' : 'px-12'}`}>

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
                        <span className="text-[#6DC4A7] font-black text-[1.4rem]">
                          {ing.amount}{' '}
                        </span>
                      )}
                      <span className={`font-bold text-[1.4rem] ${isChecked ? 'text-white/40 line-through' : 'text-white/80'}`}>
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
              // All steps at once — the cook is 10-15 ft away and can't tap
              // through a carousel. Big type, every step visible (multi-column
              // when there are many, so they fit on one screen).
              <div
                className="flex-1 overflow-y-auto pr-2"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
              >
                <div className={narrativeSteps.length > 6 ? 'columns-2 gap-10' : ''}>
                  {narrativeSteps.map((step, i) => (
                    <div key={i} className="flex items-start gap-5 mb-6 break-inside-avoid">
                      <div className="w-12 h-12 rounded-xl bg-[#F9C35C] flex items-center justify-center flex-shrink-0">
                        <span className="text-[#0f172a] font-black text-[1.5rem]">{i + 1}</span>
                      </div>
                      <p
                        className="flex-1 text-white/90 font-semibold text-[1.7rem] leading-snug pt-1"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            step.replace(
                              /\*\*([^*]+)\*\*/g,
                              '<strong class="text-[#6DC4A7] font-bold">$1</strong>'
                            )
                          )
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
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

// ── Day nav rail ──
//
// A full-height edge rail rather than a small arrow: the cook is at the counter
// with wet hands, so the target is 112px wide and the whole body tall. It names
// the day AND the meal, so you know where the arrow goes before you commit.

function DayNavButton({
  side, day, onClick,
}: { side: 'prev' | 'next'; day: RecipeDayNeighbor; onClick: () => void }) {
  const isPrev = side === 'prev'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${isPrev ? 'Previous' : 'Next'} day: ${day.label}, ${day.title}`}
      style={{ touchAction: 'pan-y' }}
      className={`
        absolute top-[112px] bottom-6 w-[150px] z-40
        ${isPrev ? 'left-0 bg-gradient-to-r border-r' : 'right-0 bg-gradient-to-l border-l'}
        from-white/[0.07] to-transparent border-white/[0.08]
        flex flex-col items-center justify-center gap-4 px-4
        transition-all duration-150 active:scale-[0.97] active:from-white/[0.16]
        hover:from-white/[0.11]
      `}
    >
      <div className="w-14 h-14 rounded-2xl bg-white/[0.08] border border-white/15 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-8 h-8 text-white/75"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={isPrev ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
        </svg>
      </div>
      <div className="text-[#F9C35C]/70 font-black text-[0.9rem] uppercase tracking-widest">
        {day.label}
      </div>
      <div className="text-white/65 font-bold text-[1.1rem] leading-tight line-clamp-4">
        {day.title}
      </div>
    </button>
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
