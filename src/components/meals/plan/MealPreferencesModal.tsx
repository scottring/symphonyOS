import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useMealPreferences } from '@/hooks/useMealPreferences'

interface Props {
  isOpen: boolean
  onClose: () => void
}

/** Editor for the household's meal "master prompt" — the standing instructions
 *  both AI surfaces always follow. Free-text so the user can write it like a
 *  prompt; shared with the household (couple-scoped note). */
export function MealPreferencesModal({ isOpen, onClose }: Props) {
  const { content, loading, saving, error, save } = useMealPreferences()
  const [draft, setDraft] = useState('')

  // Seed the editor from the loaded note each time it opens / finishes loading.
  useEffect(() => {
    if (isOpen && !loading) setDraft(content)
  }, [isOpen, loading, content])

  if (!isOpen) return null

  const handleSave = async () => {
    const ok = await save(draft)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-elevated rounded-3xl shadow-elevated max-w-2xl w-full mx-6 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 pb-4 border-b border-neutral-200">
          <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500">
            <Sparkles className="w-3.5 h-3.5" /> Meal preferences · master prompt
          </div>
          <p className="mt-2 font-display italic text-[0.95rem] text-neutral-500">
            Standing instructions the planner always follows. A tweak you make in chat for a single week won't change this — say "from now on…" to make something permanent.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-16 text-center text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Wholesome, locally focused, veggie-heavy meals for our family of four — two adults and 8-year-old twins. Dinners that make leftovers for next-day lunch. Fridays are date night; the kids don't eat dinner with us."
              className="w-full min-h-[320px] px-4 py-3 rounded-xl border border-neutral-200 bg-bg-base font-body text-[14px] leading-relaxed focus:outline-none focus:border-primary-500 resize-y"
              autoFocus
            />
          )}
          {error && <div className="mt-3 text-accent-500 text-[13px]">{error}</div>}
        </div>

        <div className="p-4 border-t border-neutral-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">Cancel</button>
          <button
            onClick={() => void handleSave()}
            disabled={loading || saving}
            className="btn-primary px-5 py-2 inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
