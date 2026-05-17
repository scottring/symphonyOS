import { Pin } from 'lucide-react'
import { RHYTHM_MODE_LABELS, type RhythmMode } from './rhythm/rhythmMode'
import type { NowFocus } from './nowFocus'

const MODE_DEFAULT_BLURB: Record<RhythmMode, { label: string; body: string }> = {
  morning: { label: 'Morning routine', body: "Let's get everyone moving — what's first?" },
  day: { label: 'Today', body: 'The day is in motion.' },
  'after-school': { label: 'After school', body: 'Pickup, snacks, and the slide into evening.' },
  dinner: { label: "Tonight's dinner", body: 'What are we cooking, and what do we need?' },
  bedtime: { label: 'Bedtime', body: 'Wind it down — books, baths, lights out.' },
  'wind-down': { label: 'Wind down', body: 'Tomorrow comes early. Rest well.' },
}

interface WallNowCardProps {
  focus: NowFocus
  pinned: boolean
  onPinToggle: () => void
  familyPrompt: string | null
}

function renderContent(focus: NowFocus): { label: string; title: string; body?: string } {
  if (focus.kind === 'pinned') return { label: 'Pinned', title: focus.pinned.title }
  if (focus.kind === 'imminent') {
    const entity = focus.entity.entity as { title: string }
    return { label: 'Up next', title: entity.title }
  }
  if (focus.kind === 'override-mode') {
    const m = RHYTHM_MODE_LABELS[focus.mode]
    const def = MODE_DEFAULT_BLURB[focus.mode]
    return { label: m.label, title: def.label, body: def.body }
  }
  if (focus.kind === 'override-item') {
    return { label: 'Detail', title: 'Tapped item' }
  }
  const def = MODE_DEFAULT_BLURB[focus.mode]
  return { label: 'Right now', title: def.label, body: def.body }
}

export function WallNowCard({ focus, pinned, onPinToggle, familyPrompt }: WallNowCardProps) {
  const content = renderContent(focus)
  const showPrompt =
    familyPrompt &&
    ((focus.kind === 'mode-default' && focus.mode === 'dinner') ||
     (focus.kind === 'override-mode' && focus.mode === 'dinner'))

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 p-7 text-white flex flex-col gap-3 h-full shadow-lg">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-widest text-white/60">{content.label}</div>
        <button
          type="button"
          aria-label="Pin"
          onClick={onPinToggle}
          className={`p-2 rounded-md transition-colors ${pinned ? 'text-amber-300 bg-amber-900/30' : 'text-white/40 hover:text-white/80'}`}
        >
          <Pin className="w-5 h-5" />
        </button>
      </div>
      <h2 className="font-display text-3xl font-semibold leading-tight">{content.title}</h2>
      {content.body && (
        <p className="text-base text-white/80 leading-relaxed">{content.body}</p>
      )}
      {showPrompt && familyPrompt && (
        <div className="mt-auto text-sm text-white/80 bg-white/10 rounded-lg px-4 py-3">
          💬 Tonight's question: <span className="italic">"{familyPrompt}"</span>
        </div>
      )}
    </div>
  )
}
