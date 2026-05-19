import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ConceptIcon } from '@/lib/conceptIcons'

export interface DiscoveredRecipe {
  title: string
  why: string
  prep_minutes: number
  is_prep_friendly: boolean
  tags: string[]
  ingredients: string[]
  instructions: string[]
  acceptance_sentence: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (recipe: DiscoveredRecipe) => Promise<void>
}

export function RecipeDiscoverDialog({ isOpen, onClose, onSave }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<DiscoveredRecipe[] | null>(null)
  const [savingTitle, setSavingTitle] = useState<string | null>(null)

  if (!isOpen) return null

  const close = () => {
    setQuery(''); setBusy(false); setError(null); setCandidates(null); setSavingTitle(null)
    onClose()
  }

  const handleFind = async () => {
    if (!query.trim()) return
    setBusy(true); setError(null); setCandidates(null)
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('recipe-discover', {
        body: { query: query.trim(), source: 'ai' },
      })
      if (invokeErr || !data) {
        setError(invokeErr?.message ?? 'Discovery failed')
        return
      }
      const result = data as { candidates: DiscoveredRecipe[]; source: string }
      setCandidates(result.candidates ?? [])
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (recipe: DiscoveredRecipe) => {
    setSavingTitle(recipe.title)
    try {
      await onSave(recipe)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingTitle(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm" onClick={close}>
      <div className="bg-bg-elevated rounded-3xl shadow-elevated max-w-2xl w-full mx-6 p-8 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">
          <ConceptIcon name="ai" size={11} decorative /> FIND A RECIPE
        </div>
        <h2 className="font-display text-3xl text-neutral-800 mb-5">
          What are you in the <span className="italic text-primary-500">mood for?</span>
        </h2>

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !busy) handleFind() }}
            placeholder="kid-friendly chicken · 30-min vegetarian · Mediterranean lunch …"
            autoFocus
            className="flex-1 px-4 py-2.5 rounded-2xl border border-neutral-200 bg-bg-base text-[15px] focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={handleFind}
            disabled={!query.trim() || busy}
            className="px-5 py-2.5 rounded-2xl bg-primary-500 text-white font-medium disabled:opacity-40 hover:bg-primary-600 whitespace-nowrap"
          >
            {busy ? 'Finding…' : 'Find'}
          </button>
        </div>

        {error && <p className="mt-3 text-[14px] text-accent-500">{error}</p>}

        {candidates && (
          <div className="mt-6 overflow-auto space-y-3 flex-1 min-h-0">
            {candidates.map((r, i) => (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-bg-base p-4">
                <div className="flex items-baseline gap-2 mb-1">
                  <h3 className="font-display text-[1.25rem] text-neutral-800 flex-1">{r.title}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">
                    AI-generated
                  </span>
                </div>
                <p className="font-display italic text-[14px] text-neutral-500 mb-2">{r.why}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-neutral-600 mb-3">
                  <span>~{r.prep_minutes} min</span>
                  {r.is_prep_friendly && <span className="text-primary-500">prep-friendly</span>}
                  {r.tags.slice(0, 5).map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-[11px]">{t}</span>
                  ))}
                </div>
                {r.acceptance_sentence && (
                  <p className="font-display italic text-[13px] text-sage-500 mb-3">{r.acceptance_sentence}</p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-neutral-400 italic">
                    {r.ingredients.length} ingredients · {r.instructions.length} steps
                  </span>
                  <button
                    onClick={() => handleSave(r)}
                    disabled={savingTitle === r.title}
                    className="px-4 py-1.5 rounded-full bg-primary-500 text-white text-[12px] font-medium disabled:opacity-40 hover:bg-primary-600"
                  >
                    {savingTitle === r.title ? 'Saving…' : 'Save to shelf'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={close} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
