import { useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/task'
import { TriageRow, applyTriageVerdict, type Verdict } from './TriageRow'
import type { PlacementFate } from '@/lib/planning/lineage'

/**
 * A horizon pool as a header dropdown — "Week" / "Month" in Today's controls
 * strip. Scott, 2026-08-19: these pools must NEVER be part of the
 * daily review/planning session; they are separate drop-downs "up here",
 * available to look at and pick from when desired. So the ReviewDrawer knows
 * nothing about them — this is their only home on Today.
 *
 * The trigger always renders (a place to look is only a place if it's always
 * there); an empty pool just says so. Picks write through the same handlers
 * page rows use, via applyTriageVerdict.
 */

interface HorizonPoolDropdownProps {
  /** Trigger text, e.g. "Week" / "Month". */
  label: string
  tasks: Task[]
  /** Verbs each row offers — the week pool doesn't offer "This wk". */
  offer: Verdict[]
  /** The verb a row leads with; the rest of `offer` waits behind ⋯. The week
   * list leads with "Do today", the month list with "This week" (a copy down).
   * Without it, every verb shows — the triage posture the School pool keeps. */
  lead?: Verdict
  /** What an empty list says, in its own words. */
  emptyCopy?: string
  viewedDate: Date
  onUpdateTask: (id: string, updates: Partial<Task>) => void | Promise<void | boolean>
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void | Promise<void | boolean>
  onDeleteTask?: (id: string) => void
  /** Completes a pool item in place — the page's toggle handler, so
   * completion side effects (linger, follow-ups) stay consistent. */
  onCompleteTask?: (id: string) => void
  /** Route for the pool's full bench, e.g. '/week'. Renders an open link. */
  benchRoute?: string
  benchLabel?: string
  /** Optional per-row detail line — the School pool uses it to say what a
   * candidate is asking of you, with the full source label as its tooltip. */
  metaFor?: (task: Task) => { text: string; title?: string } | undefined
  /** Marks a row as arrived-since-last-look. The School pool passes it; the
   * week and month pools are rungs of a rhythm, not a feed, and don't. */
  isNewFor?: (task: Task) => boolean
  /** Puts a dot on the trigger. Deliberately not a count — Today does not get
   * scoreboards, and "is there anything I haven't seen" is a yes/no. */
  hasNew?: boolean
  /** Fired as the dropdown opens and closes, so the host can record that the
   * pool has been looked at. */
  onOpenChange?: (open: boolean) => void
  /** The month pool passes this: a row that has been copied down shows a →
   * mark instead of verbs. */
  placedFor?: (task: Task) => PlacementFate
}

export function HorizonPoolDropdown({
  label, tasks, offer, lead, emptyCopy, viewedDate, onUpdateTask, onPushTask, onDeleteTask, onCompleteTask, benchRoute, benchLabel,
  metaFor, isNewFor, hasNew, onOpenChange, placedFor,
}: HorizonPoolDropdownProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  // taskId → verdict, for resolved-row rendering. Cleared on close so a
  // reopened dropdown shows the fresh pool, not stale checkmarks.
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(() => new Map())
  const close = useCallback(() => {
    setOpen(false)
    setVerdicts(new Map())
    onOpenChange?.(false)
  }, [onOpenChange])
  const openUp = useCallback(() => { setOpen(true); onOpenChange?.(true) }, [onOpenChange])

  const onVerdict = (t: Task, v: Verdict) => {
    void (async () => {
      // A cancelled domain gate writes nothing — don't mark the row resolved.
      const ok = await applyTriageVerdict(t, v, { viewedDate, onUpdateTask, onPushTask, onDeleteTask })
      if (ok) setVerdicts((prev) => new Map(prev).set(t.id, v))
    })()
  }

  const onComplete = onCompleteTask
    ? (t: Task) => {
        onCompleteTask(t.id)
        setVerdicts((prev) => new Map(prev).set(t.id, 'completed' as Verdict))
      }
    : undefined

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : openUp())}
        aria-expanded={open}
        // Named "<label> pool", not just "<label>". Dropping the count from
        // the visible label left this button's accessible name as the bare
        // word "Week", which is what a Day/Week/Month VIEW switcher would also
        // be called — ambiguous to a screen reader, and it collided with the
        // TodayView guard that asserts no view switcher lives on this page.
        aria-label={`${label} pool`}
        title={`The ${label.toLowerCase()} pool — look and pick, whenever you want`}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        {/* The bare label, no count (2026-08-31). "Month · 48" was the
            loudest number on Today and the one nobody could act on — a tally
            of everything not yet done, sitting in the header of a page whose
            whole claim is that it shows only what you have committed to. The
            dot beside it already answers the question worth asking here: is
            there anything I haven't looked at? This component argued the same
            point for `hasNew` and then contradicted itself two lines later. */}
        {label}
        {hasNew && (
          <span
            aria-label={`New in ${label.toLowerCase()}`}
            className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-primary-500"
          />
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-[440px] max-w-[90vw] max-h-[60vh] overflow-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
            {tasks.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-neutral-400">{emptyCopy ?? 'Nothing here right now.'}</p>
            ) : (
              <ul className="space-y-1.5">
                {tasks.map((t) => (
                  <TriageRow key={t.id} task={t} offer={offer} lead={lead}
                    meta={metaFor?.(t)?.text} metaTitle={metaFor?.(t)?.title}
                    isNew={isNewFor?.(t)}
                    verdict={verdicts.get(t.id)} canDelete={!!onDeleteTask}
                    placed={placedFor?.(t)}
                    onVerdict={onVerdict} onComplete={onComplete} />
                ))}
              </ul>
            )}
            {benchRoute && (
              <button type="button" onClick={() => { close(); void navigate(benchRoute) }}
                className="mt-1.5 w-full rounded-lg px-2 py-1.5 text-left text-xs text-primary-600 hover:bg-primary-50 hover:text-primary-700 transition-colors">
                {benchLabel ?? 'Open'} →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
