// src/components/planning/guided/ListSuggestions.tsx
//
// Blank-page helper for the write-list step. Reads the WHOLE level-above list
// (year goals for the season, the season list for the month, the month list
// for the week) and asks the guide for a spread of THIS-horizon-sized moves,
// offered as tap-to-fill chips. Picking a chip FILLS the write input (the human
// edits and confirms) — the assistant never writes to the list. The chips stay
// up after a pick so you can grab several in a row.
//
// Same resilient contract as SeasonMoveSuggestions: the above-list and the
// sizing rule ride in the prompt itself (works against a pre-sessionContext
// agent deployment); offline degrades to one quiet line.
import { useState, useCallback } from 'react'
import { Sparkles, RotateCw } from 'lucide-react'
import { streamSymphonyAgent } from '@/lib/agentStream'
import { parseSuggestions } from './parseSuggestions'

export type WriteBucket = 'quarter' | 'month' | 'week'

const CONFIG: Record<WriteBucket, {
  sizeLabel: string
  periodLabel: string
  listName: string
  horizon: string
  rule: string
}> = {
  quarter: {
    sizeLabel: 'season-sized',
    periodLabel: 'this season',
    listName: 'season',
    horizon: 'seasonal',
    rule: 'an OUTCOME finishable within these three months, stated as a result (not an activity)',
  },
  month: {
    sizeLabel: 'month-sized',
    periodLabel: 'this month',
    listName: 'month',
    horizon: 'monthly',
    rule: 'ONE concrete chunk finishable this month — an order placed, a call made, a decision written down',
  },
  week: {
    sizeLabel: 'week-sized',
    periodLabel: 'this week',
    listName: 'week',
    horizon: 'weekly',
    rule: 'a single sitting you could finish in one focused block this week',
  },
}

export function ListSuggestions({ bucket, aboveItems, aboveLabel, existingItems = [], onPick, suggestLabel, pickCta }: {
  bucket: WriteBucket
  /** Titles of the level-above list — the fuel for the suggestions. */
  aboveItems: string[]
  /** Human label for the level above, e.g. "your season list". */
  aboveLabel: string
  /** Titles already on THIS level (list, picks, shelf) — suggestions must not
   *  duplicate or near-duplicate these. */
  existingItems?: string[]
  /** Handles a tapped chip. In WriteListStep this FILLS the input (human edits
   *  and confirms); in PickByGoalStep it adds the pick directly (tap-to-add).
   *  Either way the human's tap is the only write path — the AI never writes. */
  onPick: (text: string) => void
  /** Overrides the idle button copy (default: "Suggest {size}-sized items").
   *  Pass e.g. "Suggest picks" when the chips add directly rather than fill. */
  suggestLabel?: string
  /** Overrides the tap-instruction footer + chip tooltip. Default is the
   *  fill-the-box copy; pass an add-mode line when a tap creates the item. */
  pickCta?: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const cfg = CONFIG[bucket]

  const suggest = useCallback(() => {
    setState('loading')
    void streamSymphonyAgent(
      [{
        role: 'user',
        content:
          `I'm writing my ${cfg.periodLabel} list. For reference, here is ${aboveLabel}:\n` +
          aboveItems.map((t) => `- ${t}`).join('\n') + '\n\n' +
          (existingItems.length > 0
            ? `Already on my ${cfg.listName} list (do NOT suggest duplicates or near-duplicates of these):\n` +
              existingItems.map((t) => `- ${t}`).join('\n') + '\n\n'
            : '') +
          `Suggest 3 candidate ${cfg.sizeLabel} items for ${cfg.periodLabel} that move these forward: ` +
          `each ${cfg.rule}, specific, under 12 words. Draw from the list above but translate to the ` +
          `right grain — don't just copy a line verbatim. Return ONLY a JSON array of strings — no prose.`,
      }],
      {
        sessionContext: {
          horizon: cfg.horizon, periodLabel: cfg.periodLabel,
          stepId: 'write-list', stepTitle: `Write the ${cfg.listName}’s list`,
          bucket, aboveTitles: aboveItems, listTitles: existingItems,
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
  }, [bucket, aboveItems, aboveLabel, existingItems, cfg])

  // Nothing above to draw from → no helper (the blank page has no fuel yet).
  if (aboveItems.length === 0) return null

  if (state === 'loading') {
    return <p className="text-[11px] text-neutral-400 italic">thinking about {cfg.periodLabel}…</p>
  }

  if (state === 'idle' || state === 'error') {
    return (
      <div>
        <button type="button" onClick={suggest}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 transition-colors">
          <Sparkles className="w-3 h-3" /> {suggestLabel ?? `Suggest ${cfg.sizeLabel} items`}
        </button>
        {state === 'error' && (
          <p className="text-[11px] text-neutral-400 italic mt-1">Your guide is offline — write it yourself; you know the plan best.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1" data-testid="list-suggestions">
      <div className="flex flex-wrap items-center gap-1.5">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)}
            title={pickCta ?? 'Fills the box — edit before adding'}
            className="text-[11.5px] px-2 py-1 rounded-md border border-primary-200 bg-white text-neutral-700 hover:border-primary-400 hover:text-primary-800 transition-colors">
            {s}
          </button>
        ))}
        <button type="button" onClick={suggest} aria-label="Suggest more"
          title="Suggest more"
          className="p-1 rounded-md text-neutral-400 hover:text-primary-600 transition-colors">
          <RotateCw className="w-3 h-3" />
        </button>
      </div>
      <p className="text-[11px] text-neutral-400">{pickCta ?? 'Tap one to fill the box — edit before adding.'}</p>
    </div>
  )
}
