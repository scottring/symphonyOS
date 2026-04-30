import { useState } from 'react'

interface Props {
  weightLb?: number
  weightNote?: string
  recentWeights: { date: Date; weight?: number }[]
  onChange: (input: { weightLb?: number | null; weightNote?: string | null }) => void
}

/** Hidden by default. Click `▾ Show weight & extras` → reveals number field,
 *  freeform note, and a 7-day strip. Once shown, stays shown until hidden. */
export function WeightExtras({ weightLb, weightNote, recentWeights, onChange }: Props) {
  const [open, setOpen] = useState(weightLb != null)
  const [draftWeight, setDraftWeight] = useState(weightLb != null ? String(weightLb) : '')
  const [draftNote, setDraftNote] = useState(weightNote ?? '')

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="mt-3 text-[12px] text-neutral-400 hover:text-primary-500 italic">
        ▾ Show weight & extras
      </button>
    )
  }

  const commitWeight = () => {
    const n = parseFloat(draftWeight)
    if (Number.isNaN(n)) {
      onChange({ weightLb: null })
      return
    }
    onChange({ weightLb: n })
  }
  const commitNote = () => {
    const next = draftNote.trim()
    onChange({ weightNote: next.length === 0 ? null : next })
  }

  // Trend strip (no axis labels, no goal line, no green/red).
  const max = recentWeights.reduce((m, d) => d.weight && d.weight > m ? d.weight : m, 0) || 1
  const min = recentWeights.reduce((m, d) => d.weight && (m === 0 || d.weight < m) ? d.weight : m, 0) || max

  return (
    <div className="mt-3 pt-3 border-t border-neutral-100">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">WEIGHT & EXTRAS</div>
        <button onClick={() => setOpen(false)}
                className="text-[11px] text-neutral-400 hover:text-neutral-600 italic">
          ▴ hide
        </button>
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <input
          value={draftWeight}
          onChange={e => setDraftWeight(e.target.value)}
          onBlur={commitWeight}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          inputMode="decimal"
          placeholder="183.4"
          className="w-24 px-2 py-1.5 rounded-md border border-neutral-200 bg-bg-base font-display text-[1.5rem] text-neutral-800 focus:border-primary-500 focus:outline-none"
        />
        <span className="text-[12px] text-neutral-400">lb</span>
        <input
          value={draftNote}
          onChange={e => setDraftNote(e.target.value)}
          onBlur={commitNote}
          placeholder="how I felt"
          className="flex-1 px-2 py-1.5 rounded-md border border-dashed border-neutral-200 bg-bg-base font-display italic text-[0.95rem] text-neutral-600 placeholder:text-neutral-400 focus:border-primary-300 focus:outline-none"
        />
      </div>

      {/* 7-day strip — bars, no axes, no goal */}
      <div className="mt-3 flex items-end gap-1.5 h-12">
        {recentWeights.map((d, i) => {
          const w = d.weight
          const range = Math.max(0.5, max - min)
          const pct = w ? ((w - min) / range) * 0.85 + 0.15 : 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t-sm bg-primary-300/60"
                   style={{ height: `${pct * 100}%`, minHeight: w ? 4 : 0 }} />
              <div className={`w-full ${w ? 'border-t border-neutral-200' : ''}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
