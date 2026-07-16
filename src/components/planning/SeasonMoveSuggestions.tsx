// src/components/planning/SeasonMoveSuggestions.tsx
//
// The blank-page helper for goal promotion: asks the assistant for 2–3
// season-sized translations of a year goal and offers them as tap-to-fill
// chips. Picking a chip FILLS the translation input (the human edits and
// confirms) — the assistant never writes to a list. Shared by the seasonal
// wizard's look-above step and the season page's reference panel.
//
// Resilient by construction: the goal and the sizing rule ride in the user
// prompt itself, so this works against an agent deployment that predates
// sessionContext injection. Offline → one quiet line; the prompt still works.
import { useState, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { streamSymphonyAgent } from '@/lib/agentStream'
import { parseSuggestions } from '@/components/planning/guided/parseSuggestions'

export function SeasonMoveSuggestions({ goalName, onPick }: { goalName: string; onPick: (text: string) => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [suggestions, setSuggestions] = useState<string[]>([])

  const suggest = useCallback(() => {
    setState('loading')
    void streamSymphonyAgent(
      [{
        role: 'user',
        content:
          `I'm promoting the year goal "${goalName}" into my season plan. ` +
          'Suggest 3 candidate season-sized first moves: each an OUTCOME finishable within three months, ' +
          'stated as a result (not an activity), specific, under 12 words. ' +
          'Return ONLY a JSON array of strings — no prose.',
      }],
      {
        sessionContext: {
          horizon: 'seasonal', periodLabel: 'this season',
          stepId: 'promote-goal', stepTitle: 'Start this season',
          bucket: 'quarter', goalNames: [goalName],
        },
        onDone: (reply) => {
          const parsed = parseSuggestions(reply).slice(0, 3)
          if (parsed.length === 0) { setState('error'); return }
          setSuggestions(parsed)
          setState('done')
        },
        onError: () => setState('error'),
      },
    )
  }, [goalName])

  if (state === 'idle') {
    return (
      <button type="button" onClick={suggest}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 transition-colors mt-1.5">
        <Sparkles className="w-3 h-3" /> Suggest season-sized moves
      </button>
    )
  }
  if (state === 'loading') {
    return <p className="text-[11px] text-neutral-400 italic mt-1.5">thinking about “{goalName}”…</p>
  }
  if (state === 'error') {
    return <p className="text-[11px] text-neutral-400 italic mt-1.5">Your guide is offline — write it yourself; you know the year best.</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="season-move-suggestions">
      {suggestions.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)}
          title="Fills the field — edit before adding"
          className="text-[11.5px] px-2 py-1 rounded-md border border-primary-200 bg-white text-neutral-700 hover:border-primary-400 hover:text-primary-800 transition-colors">
          {s}
        </button>
      ))}
    </div>
  )
}
