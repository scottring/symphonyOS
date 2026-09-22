// src/components/plan/GoalsSheet.tsx
//
// The ◎ Goals reference: the year's, the season's and the month's goals,
// beside you anywhere in Plan. Reference only — nothing here writes, nothing
// here counts; each level links to the page that owns it. The bottom-sheet
// recipe is `PlanningSheet`'s (portal to <body>, scrim, safe-area padding),
// because a fixed sheet inside the transformed phone shell is fixed to that
// ancestor, not the viewport.

import { useDialogFocus } from '@/hooks/useDialogFocus'
import { useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Target, X } from 'lucide-react'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useDomain } from '@/hooks/useDomain'
import { goalsReference, type RefSection } from '@/lib/planning/goalsReference'

function Section({ section, onClose }: { section: RefSection; onClose: () => void }) {
  return (
    <section className="border-b border-neutral-200 py-3 last:border-b-0">
      <h3 className="flex items-baseline justify-between gap-3 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
        <span className="min-w-0 truncate">{section.label}</span>
        <Link to={section.to} onClick={onClose} className="shrink-0 text-[13px] font-semibold normal-case tracking-normal text-primary-700">
          Open →
        </Link>
      </h3>
      {section.rows.length === 0
        ? <p className="mt-2 text-[13px] text-neutral-400">Nothing yet.</p>
        : <ul className="mt-2 space-y-2">
            {section.rows.map(row => (
              <li key={row.id} className="flex min-w-0 items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block break-words text-[14px] text-neutral-900">{row.title}</span>
                  {row.note && <span className="block break-words text-[13px] text-neutral-500">{row.note}</span>}
                </span>
              </li>
            ))}
          </ul>}
    </section>
  )
}

function GoalsSheetBody({ onClose }: { onClose: () => void }) {
  const { goals } = useGoalsContext()
  const { tasks } = useSupabaseTasks()
  const { seasons } = useHouseholdSeasons()
  const { getCurrentUserMember } = useFamilyMembers()
  const { layers } = useDomain()
  const meId = getCurrentUserMember()?.id ?? null
  const reference = useMemo(
    () => goalsReference({ goals, tasks, now: new Date(), seasons, meId, layers }),
    [goals, tasks, seasons, meId, layers],
  )
  return (
    <>
      <Section section={reference.year} onClose={onClose} />
      <Section section={reference.season} onClose={onClose} />
      <Section section={reference.month} onClose={onClose} />
    </>
  )
}

export function GoalsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, sheetRef, onClose)

  if (!open) return null
  return createPortal(
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />
      )}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Goals"
        aria-hidden={!open}
        inert={!open}
        className={`fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-2xl bg-bg-elevated px-5 transform transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-neutral-300" />
        </div>
        <header className="flex items-start justify-between gap-3 border-b border-neutral-300 pb-3">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] leading-tight text-neutral-900">Goals</h2>
            <p className="mt-1 text-[13px] text-neutral-500">For reference. Edit them on their pages.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close goals" className="shrink-0 rounded p-2 text-neutral-500 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </header>
        {open && <GoalsProvider><GoalsSheetBody onClose={onClose} /></GoalsProvider>}
      </div>
    </>,
    document.body,
  )
}
