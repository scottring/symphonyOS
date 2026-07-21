// src/components/planning/explainers/scenes.tsx
//
// Vignette primitives + the five per-horizon explainer scripts. Vignettes are
// small illustrative chips — deliberately NOT the real season/month/week
// cards (BetCard, MoveCard, etc.) — so the explainer stays lightweight and
// never drifts out of sync with production card markup. Copy is verbatim
// from the Task 8 spec; do not paraphrase it.
import type { ReactNode } from 'react'
import { ArrowDown, AlertTriangle, Check, Archive, Inbox } from 'lucide-react'
import type { HorizonId } from '@/lib/today/horizons'

export interface Scene {
  headline: string
  body?: string
  vignette: ReactNode
}

// ── Primitives ──────────────────────────────────────────────────────────
function Chip({ label, tone = 'neutral', display = false, className = '' }: {
  label: string
  tone?: 'primary' | 'neutral'
  display?: boolean
  className?: string
}) {
  const toneClass = tone === 'primary'
    ? 'bg-primary-50 border-primary-200 text-primary-800'
    : 'bg-white border-neutral-200 text-neutral-700'
  return (
    <div className={`rounded-xl border px-4 py-2.5 text-sm shadow-sm ${display ? 'font-display text-base font-semibold' : 'font-medium'} ${toneClass} ${className}`}>
      {label}
    </div>
  )
}

function MiniGoal({ className = '' }: { className?: string }) {
  return <Chip label="Get healthier" tone="primary" display className={className} />
}
function MiniBet({ className = '' }: { className?: string }) {
  return <Chip label="Ran a 10K, injury-free" className={className} />
}
function MiniMove({ className = '' }: { className?: string }) {
  return <Chip label="Book the physio assessment" className={className} />
}
function MiniDay({ className = '' }: { className?: string }) {
  return <Chip label="Tue 9am · physio call" className={className} />
}

// The signature "cascade drop" vignette — goal → bet → move → day, each
// entering staggered via .ex-drop / data-ex-delay. Reused by every script
// that needs to show the full thread in one scene.
function CascadeDrop() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="ex-drop" data-ex-delay="1"><MiniGoal /></div>
      <ArrowDown className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
      <div className="ex-drop" data-ex-delay="2"><MiniBet /></div>
      <ArrowDown className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
      <div className="ex-drop" data-ex-delay="3"><MiniMove /></div>
      <ArrowDown className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
      <div className="ex-drop" data-ex-delay="4"><MiniDay /></div>
    </div>
  )
}

// A goal above a bet, connected — for the "seasons take bets on goals" beat.
function GoalToBet() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="ex-drop" data-ex-delay="1"><MiniGoal /></div>
      <ArrowDown className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
      <div className="ex-drop" data-ex-delay="2"><MiniBet /></div>
    </div>
  )
}

// A single goal, dimmed — "stays on the shelf" (year scene 4).
function ShelvedGoal() {
  return (
    <div className="flex flex-col items-center gap-2 ex-rise">
      <Chip label="Get healthier" tone="neutral" display className="opacity-50" />
      <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
        <Archive className="w-3 h-3" /> on the shelf
      </span>
    </div>
  )
}

// A dot cap counter — "five to eight, never more" (season scene 2), reused
// by the month script's own cap beat with a month-appropriate caption (the
// dot shape communicates "there's a ceiling"; the words say whose ceiling).
// Only vignette carrying digits, deliberately, so the count reads as a
// shape, not a rule.
function CapCounter({ caption = '5–8 picks a season' }: { caption?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 ex-rise">
      <div className="flex items-center gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < 5 ? 'bg-primary-500' : 'bg-primary-200'}`} />
        ))}
      </div>
      <span className="text-xs font-semibold text-neutral-500">{caption}</span>
    </div>
  )
}

// A bet with a "copy down" arrow into a move — season scene 3.
function BetFeedsMove() {
  return (
    <div className="flex flex-col items-center gap-1.5 ex-rise">
      <MiniBet />
      <ArrowDown className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
      <MiniMove />
    </div>
  )
}

// A bet with an amber warning badge — the starving-bet indicator (season 4).
function StarvingBet() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 ex-rise">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <span className="text-sm font-medium text-amber-800">Ran a 10K, injury-free</span>
    </div>
  )
}

// Three honorable endings for a bet — win, carry, let go (season scene 5).
function BetOutcomes() {
  return (
    <div className="flex items-center gap-3 ex-rise">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-700">
        <Check className="w-3.5 h-3.5" /> Won
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
        <ArrowDown className="w-3.5 h-3.5 rotate-180" /> Carried
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400">
        <Archive className="w-3.5 h-3.5" /> Let go
      </span>
    </div>
  )
}

// Two duplicate move chips — "copying down duplicates on purpose" (month 2).
function DuplicateMoves() {
  return (
    <div className="flex flex-col items-center gap-1.5 ex-rise">
      <MiniMove />
      <span className="text-[10px] text-neutral-400">copied down —</span>
      <MiniMove className="border-primary-200 bg-primary-50 text-primary-800" />
    </div>
  )
}

// A move landing on a calendar day — "moves land on real days" (month 3).
function MoveToDay() {
  return (
    <div className="flex flex-col items-center gap-1.5 ex-rise">
      <MiniMove />
      <ArrowDown className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
      <MiniDay />
    </div>
  )
}

// A day chip alone, placed on the grid — "the week is where moves get
// placed" (week scene 1).
function PlacedDay() {
  return <div className="ex-rise"><MiniDay /></div>
}

// A dimmed, crossed-out "yesterday" slot next to a live day — the grid
// refusing the past (week scene 2).
function GridRefusesPast() {
  return (
    <div className="flex items-center gap-3 ex-rise">
      <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-300 line-through">
        Mon 9am
      </div>
      <ArrowDown className="w-3.5 h-3.5 text-neutral-300 -rotate-90" aria-hidden />
      <MiniDay />
    </div>
  )
}

// An empty pool with a full grid — "placed rocks leave the pool" (week 3).
function EmptyPoolFullGrid() {
  return (
    <div className="flex items-center gap-3 ex-rise">
      <span className="text-xs text-neutral-300 italic">pool: empty</span>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="w-2 h-2 rounded-full bg-primary-400" />
        ))}
      </div>
    </div>
  )
}

// A day chip that stays put — "today shows what the system already decided"
// (today scene 1).
function TodayDecided() {
  return <div className="ex-rise"><MiniDay /></div>
}

// New capture going into an inbox, not the plan — today scene 2.
function CaptureToInbox() {
  return (
    <div className="flex items-center gap-2 ex-rise">
      <Inbox className="w-4 h-4 text-neutral-400 shrink-0" />
      <span className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-500">
        Reorder printer ink
      </span>
    </div>
  )
}

// ── Scripts ─────────────────────────────────────────────────────────────
export const EXPLAINER_SCENES: Record<HorizonId, Scene[]> = {
  year: [
    {
      headline: 'Goals are directions, not tasks.',
      body: "A goal is never 'done' this quarter — it points the year.",
      vignette: <div className="ex-rise"><MiniGoal /></div>,
    },
    {
      headline: 'Seasons pick which goals get a push.',
      body: 'Every season, you pick which goals get a real push.',
      vignette: <GoalToBet />,
    },
    {
      headline: 'One goal, threading down to a single day.',
      body: 'Goal → season pick → month move → a slot on a Tuesday.',
      vignette: <CascadeDrop />,
    },
    {
      headline: "Goals you don't start stay on the shelf.",
      body: 'Nothing expires — every seasonal session offers them again.',
      vignette: <ShelvedGoal />,
    },
  ],
  season: [
    {
      headline: "A pick is an outcome true by season's end.",
      body: "Measured in weekends — 'Will drafted and signed', not 'start working on the will'.",
      vignette: <div className="ex-rise"><MiniBet /></div>,
    },
    {
      headline: 'Five to eight. Never more.',
      body: "19 picks isn't a season, it's a backlog. Extras wait on the bench, become month moves, or shelve.",
      vignette: <CapCounter />,
    },
    {
      headline: 'Picks feed months as moves.',
      body: 'Copy a pick down and it becomes concrete chunks on the month list — the pick stays here.',
      vignette: <BetFeedsMove />,
    },
    {
      headline: 'A starving pick tells you.',
      body: "A pick with nothing on this month's list shows an amber warning — that's the season doing its job.",
      vignette: <StarvingBet />,
    },
    {
      headline: 'Win it, carry it, or let it go.',
      body: 'Every outcome is honorable — a pick can go back to the bench without shame.',
      vignette: <BetOutcomes />,
    },
  ],
  month: [
    {
      headline: 'Moves, not picks.',
      body: 'A move fits in a sitting or two — an order placed, a call made.',
      vignette: <div className="ex-rise"><MiniMove /></div>,
    },
    {
      headline: 'Copying down duplicates on purpose.',
      body: 'The original stays on the list above, so each level keeps its own honest list.',
      vignette: <DuplicateMoves />,
    },
    {
      headline: 'Moves land on real days.',
      body: 'The month calendar is where ideas become dated.',
      vignette: <MoveToDay />,
    },
    {
      headline: '10–15 is a good month.',
      body: "A shorter list you believe beats a long one you ignore.",
      vignette: <CapCounter caption="10–15 moves a month" />,
    },
  ],
  week: [
    {
      headline: 'The week is where moves get placed.',
      body: 'A placement is a move with a day and a time.',
      vignette: <PlacedDay />,
    },
    {
      headline: 'The grid refuses the past.',
      body: 'Rocks land on days ahead — planning never schedules yesterday.',
      vignette: <GridRefusesPast />,
    },
    {
      headline: 'Placed rocks leave the pool.',
      body: "That's not a bug: a fully-placed week reads as an empty list and a full grid.",
      vignette: <EmptyPoolFullGrid />,
    },
  ],
  today: [
    {
      headline: 'Today shows what the system already decided.',
      body: 'The cascade ends here — you execute, you don’t re-plan.',
      vignette: <TodayDecided />,
    },
    {
      headline: 'New things go to the inbox, not the plan.',
      body: 'Capture is zero-friction; triage happens later, on purpose.',
      vignette: <CaptureToInbox />,
    },
    {
      headline: 'Every item on today can explain itself.',
      body: 'Follow the thread back: day → move → pick → goal.',
      vignette: <CascadeDrop />,
    },
  ],
  someday: [],
}
