// The Planning panel on a phone: the same panel the desktop dock draws, in a
// bottom sheet (the MoreSheet recipe — scrim, rounded top, slide-up, safe-area
// padding, grab handle). Opened by the "Planning" button on Today and Week;
// no drags here, every row has its buttons.
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { PlanningPanelHost } from './ReferenceLists'
import { DayPlanPanel, planningSubtitle, type DayPlanPanelActions } from './DayPlanPanel'
import type { DayPlan } from '@/lib/today/dayPlan'

export function PlanningSheet({ open, onClose, weekPage = null, plan, day: dayProp, actions }: {
  open: boolean
  onClose: () => void
  /** The week the page is showing, for the subtitle. */
  weekPage?: Date | null
  /** A page that already computed the day's plan (Today) hands it over, so
   *  the sheet and the page's counts cannot disagree; otherwise the sheet
   *  computes its own from the shared sources. */
  plan?: DayPlan
  day?: Date
  actions?: DayPlanPanelActions
}) {
  const day = dayProp ?? new Date()
  // Portalled to <body>: a `position: fixed` sheet inside a transformed
  // ancestor (the phone shell) would be fixed to that ancestor, not the
  // viewport, and sit below the fold (found in the 390px check, 2026-09-21).
  return createPortal(
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Planning"
        aria-hidden={!open}
        inert={!open}
        className={`fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-bg-elevated px-5 transform transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-neutral-300" />
        </div>
        <header className="flex items-start justify-between gap-3 border-b border-neutral-300 pb-3">
          <div>
            <h2 className="font-display text-[22px] leading-tight text-neutral-900">Planning</h2>
            <p className="mt-1 text-[13px] text-neutral-500">{planningSubtitle(day, weekPage)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Planning" className="rounded p-2 text-neutral-500 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
        </header>
        {open && (plan && actions
          ? <DayPlanPanel plan={plan} day={day} actions={actions} draggable={false} weekPage={weekPage} />
          : <PlanningPanelHost draggable={false} />)}
      </div>
    </>,
    document.body,
  )
}
