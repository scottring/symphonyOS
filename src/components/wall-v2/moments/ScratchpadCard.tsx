// The scratchpad on the wall's face (Scott, 2026-10-07; mockup "Wall
// Scratchpad"): where the Specials box was. The newest few open notes, seen in
// passing; any tap opens the full sheet to jot or sort. Data-free.
import { CalendarDays, CheckSquare, MessagesSquare, PenLine, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Chip, type Tint } from './tint'

export interface MomentNote {
  key: string
  text: string
  sub: string
  icon: 'note' | 'talk' | 'event' | 'task'
  authorId: string | null
}

export interface MomentScratchpad {
  rows: MomentNote[]
  /** Open the sheet; with a key, at that note. */
  onOpen: (key: string | null) => void
}

export const NOTE_ICON: Record<MomentNote['icon'], LucideIcon> = {
  note: PenLine, talk: MessagesSquare, event: CalendarDays, task: CheckSquare,
}

/** Rows the face shows before "+ N more" — nothing on the wall scrolls. */
const FACE_ROWS = 3

export function ScratchpadCard({ pad, t }: { pad: MomentScratchpad; t: Tint }) {
  const shown = pad.rows.slice(0, FACE_ROWS)
  const more = pad.rows.length - shown.length
  return (
    <section aria-label="Scratchpad"
      className="flex flex-col gap-2.5 rounded-[22px] border border-[#4a3d63] px-6 py-5"
      style={{ background: 'linear-gradient(180deg,#1d1a2b 0%,#17212c 60%)' }}>
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 font-display text-[1.9rem] font-medium leading-[1.1] text-[#f3f5f8]">Scratchpad</h2>
        {pad.rows.length > 0 && <span className="text-[1rem] text-[#93a3b5]">{pad.rows.length} open</span>}
      </div>
      <button type="button" onClick={() => pad.onOpen(null)}
        className="flex min-h-[60px] items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-[#5b4e78] px-4 text-left text-[1.25rem] text-[#b9abd6] active:bg-[#221d33]">
        <Plus className="h-6 w-6 text-[#c9a3ff]" aria-hidden="true" />Jot a note…
      </button>
      {shown.length > 0 && (
        <ul>
          {shown.map((r) => {
            const Icon = NOTE_ICON[r.icon]
            return (
              <li key={r.key} className="border-b border-[#223041] last:border-b-0">
                <button type="button" onClick={() => pad.onOpen(r.key)}
                  className="grid min-h-[56px] w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left">
                  <Icon className={`h-5 w-5 ${r.icon === 'note' ? 'text-[#8d9cad]' : 'text-[#c9a3ff]'}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-[1.25rem] leading-tight text-[#eef2f6]">{r.text}</span>
                    <span className="block truncate text-[0.92rem] text-[#8d9cad]">{r.sub}</span>
                  </span>
                  {r.authorId ? <Chip id={r.authorId} t={t} size="sm" /> : <span />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {more > 0 && (
        <button type="button" onClick={() => pad.onOpen(null)} className="min-h-[44px] text-left text-[1.05rem] text-[#93a3b5]">+ {more} more</button>
      )}
    </section>
  )
}
