import { useEffect, useState } from 'react'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { fetchMealSuggestions } from '@/lib/askSymphonyMeal'
import { useApplyMealSuggestion } from '@/hooks/useApplyMealSuggestion'
import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'

export function MealRequestCards({ request }: { request: string }) {
  const weekStart = sundayOfWeek(new Date())
  const { applySuggestion } = useApplyMealSuggestion(weekStart)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [text, setText] = useState('')
  const [cards, setCards] = useState<AskSymphonySuggestion[]>([])
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await fetchMealSuggestions(request, weekStart)
      if (cancelled) return
      if (r.error && r.cards.length === 0) {
        setState('error')
        setText(r.error)
        return
      }
      setText(r.text)
      setCards(r.cards)
      setState('ready')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  if (state === 'loading') {
    return (
      <div className="mx-2 mb-3 text-xs text-neutral-500">
        Checking the meal plan…
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="mx-2 mb-3 text-xs text-rose-600">
        Couldn't reach the meal planner: {text}
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="mx-2 mb-3 text-xs text-neutral-600">
        {text || 'No meal changes proposed.'}
      </div>
    )
  }

  return (
    <div className="mx-2 mb-3 space-y-2">
      {cards.map((c, i) => (
        <div
          key={i}
          className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3"
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">
            {c.kicker}
          </div>
          <div className="text-sm font-medium text-neutral-800">{c.title}</div>
          <div className="text-xs text-neutral-600 mt-0.5">{c.why}</div>
          <div className="flex justify-end mt-2">
            {appliedIdx.has(i) ? (
              <span className="text-xs text-emerald-700 font-medium">✓ Applied</span>
            ) : (
              <button
                onClick={async () => {
                  await applySuggestion(c)
                  setAppliedIdx(prev => new Set([...prev, i]))
                }}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-medium transition-colors"
              >
                Apply
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
