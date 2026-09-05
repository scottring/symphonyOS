// src/components/settings/SeasonsSettings.tsx
//
// The household's four seasons — the groupings it plans by, not the
// meteorological or fiscal ones. The owner edits; members read. Every
// "season" in the app (the season pool, the cadence nudge, the Season tab,
// the paper window) follows what is set here.

import { useState } from 'react'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { MONTH_NAMES } from '@/lib/cadence/periods'
import { seasonLabel, type SeasonBoundary, type Seasons } from '@/lib/cadence/seasons'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function NameInput({ index, value, onCommit }: { index: number; value: string; onCommit: (name: string) => void }) {
  // Local draft so a rename doesn't write on every keystroke.
  const [draft, setDraft] = useState(value)
  return (
    <input
      aria-label={`Season ${index + 1} name`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft.trim() && draft !== value) onCommit(draft.trim()); else setDraft(value) }}
      className="w-32 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white"
    />
  )
}

export function SeasonsSettings() {
  const { seasons, canEdit, setSeasons } = useHouseholdSeasons()

  const update = (index: number, patch: Partial<SeasonBoundary>) => {
    const next = seasons.map((s, i) => (i === index ? { ...s, ...patch } : s)) as unknown as Seasons
    void setSeasons(next)
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Seasons</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Your household's own groupings for seasonal planning. Each season runs from its start date to the next one's.
      </p>

      <div className="space-y-3">
        {seasons.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-4 bg-white rounded-lg border border-neutral-100">
            {canEdit ? (
              <>
                <NameInput index={i} value={s.name} onCommit={(name) => update(i, { name })} />
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <span>starts</span>
                  <select
                    aria-label={`Season ${i + 1} starts in`}
                    value={String(s.month)}
                    onChange={(e) => update(i, { month: Number(e.target.value) })}
                    className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white"
                  >
                    {MONTH_NAMES.map((name, m) => (
                      <option key={name} value={String(m + 1)}>{name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Season ${i + 1} start day`}
                    value={String(s.day)}
                    onChange={(e) => update(i, { day: Number(e.target.value) })}
                    className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <p className="text-neutral-700 font-medium">{s.name}</p>
                <p className="text-sm text-neutral-500">starts {MONTH_NAMES[s.month - 1]} {s.day}</p>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-500 mt-3">
        Today is in {seasonLabel(new Date(), seasons)}.
        {!canEdit && ' Only the household owner can change these.'}
      </p>
    </section>
  )
}
