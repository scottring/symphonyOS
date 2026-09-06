// src/components/plan/PlanRail.tsx
//
// The level above, folded beneath the list being written. Levels connect by
// looking, not linking: nothing drags from here and nothing is linked. It
// starts closed — a reference you unfold when you want to glance up — and
// remembers its state when given a storage key. The one verb is the arrow on
// an open task (a copy-down: "→ this month" on a season task, "→ this week"
// on a month task); goals, placed and done rows are look-only.

import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, Target } from 'lucide-react'
import type { PlanRowModel } from './PlanRow'

function readOpen(key: string | undefined): boolean {
  if (!key) return false
  try { return localStorage.getItem(key) === 'open' } catch { return false }
}
function writeOpen(key: string | undefined, open: boolean): void {
  if (!key) return
  try { localStorage.setItem(key, open ? 'open' : 'collapsed') } catch { /* private browsing */ }
}

// The hint is a one-time nudge toward the pull-down arrow (demo run
// 2026-09-06: the arrow was hover-only AND unlabeled, so no one found it).
// Shown once ever, across every rail — not per storageKey.
const HINT_SEEN_KEY = 'symphony-plan-rail-hint-seen'
function readHintSeen(): boolean {
  try { return localStorage.getItem(HINT_SEEN_KEY) === '1' } catch { return true }
}
function writeHintSeen(): void {
  try { localStorage.setItem(HINT_SEEN_KEY, '1') } catch { /* private browsing */ }
}
/** "Add to this month:" → "month" */
function pullNoun(pullLabel: string | undefined): string | null {
  return pullLabel?.match(/this (\w+)/)?.[1] ?? null
}
/** "Add to this month:" → "Add to this month" */
function pullTitle(pullLabel: string | undefined): string | undefined {
  return pullLabel?.replace(/:\s*$/, '')
}

export function PlanRail({ title, subtitle, rows, onOpen, onPullDown, pullLabel, emptyCopy, storageKey }: {
  title: string
  subtitle?: string
  rows: PlanRowModel[]
  onOpen: (row: PlanRowModel) => void
  /** Copy an open task down into the page's own level. Omitted = look only. */
  onPullDown?: (row: PlanRowModel) => void
  pullLabel?: string
  emptyCopy: string
  /** localStorage key that remembers whether the fold is open. */
  storageKey?: string
}) {
  const [open, setOpen] = useState(() => readOpen(storageKey))
  const toggle = () => { setOpen((v) => { writeOpen(storageKey, !v); return !v }) }
  // Captured once at mount, so the hint stays visible for this whole
  // session even after it flips the flag that hides it on the NEXT visit.
  const [hintSeenAtMount] = useState(() => readHintSeen())
  const showHint = open && !!onPullDown && rows.length > 0 && !hintSeenAtMount
  // Write the flag only once the hint has actually been SHOWN — a closed
  // fold, or a look-only rail with no onPullDown, must not burn the "first
  // time" for every other rail on the page (fix round 1: the flag was
  // written on every mount regardless of open/onPullDown).
  useEffect(() => { if (showHint) writeHintSeen() }, [showHint])
  const noun = pullNoun(pullLabel)
  const goals = rows.filter((r) => r.isGoal)
  const items = rows.filter((r) => !r.isGoal)
  const Row = ({ row }: { row: PlanRowModel }) => {
    const canPull = !!onPullDown && !row.isGoal && row.fate === 'open'
    return (
      <li className="group flex items-start gap-1">
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="min-w-0 flex-1 flex items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-neutral-50 transition-colors"
        >
          {row.isGoal
            ? <Target className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            : <span className={`mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full ${row.fate === 'done' ? 'bg-primary-500' : 'bg-neutral-300'}`} />}
          <span className={`min-w-0 flex-1 text-[13px] leading-snug ${row.fate === 'done' ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
            {row.title}
          </span>
          {row.fate === 'placed-open' && <span className="shrink-0 text-[11px] text-neutral-400">→ placed</span>}
          {row.fate === 'placed-done' && <span className="shrink-0 text-[11px] text-primary-700">→ done</span>}
        </button>
        {canPull && (
          <button
            type="button"
            aria-label={`${pullLabel ?? 'Add'} ${row.title}`}
            title={pullTitle(pullLabel)}
            onClick={() => onPullDown!(row)}
            className="shrink-0 mt-0.5 p-1 rounded text-primary-600 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary-50 transition-opacity"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </li>
    )
  }
  return (
    <aside aria-label={title} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-1 text-left text-xs font-semibold tracking-wide uppercase text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        <span>{title}</span>
        {subtitle && <span className="font-normal normal-case tracking-normal text-neutral-400">· {subtitle}</span>}
        {!open && <span className="ml-auto font-normal normal-case tracking-normal text-neutral-400">{rows.length}</span>}
      </button>
      {showHint && noun && (
        <p className="mt-1 text-[11px] text-neutral-400">Press → to bring one into this {noun}.</p>
      )}
      {open && (rows.length === 0 ? (
        <p className="text-sm text-neutral-400 pt-2 pb-1">{emptyCopy}</p>
      ) : (
        <div className="mt-1.5">
          {goals.length > 0 && (
            <>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">Goals</p>
              <ul className="mb-2">{goals.map((r) => <Row key={r.id} row={r} />)}</ul>
            </>
          )}
          {items.length > 0 && (
            <>
              {goals.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Tasks</p>}
              <ul>{items.map((r) => <Row key={r.id} row={r} />)}</ul>
            </>
          )}
        </div>
      ))}
    </aside>
  )
}
