import { ChevronRight } from 'lucide-react'

interface TodayBacklogFooterProps {
  /**
   * Opens the "New from email" review sheet. Passed only while the household
   * actually has unreviewed email captures — the link's presence IS the
   * signal, which is why there is no count prop and never will be. Absent
   * handler, absent link.
   */
  onReviewEmail?: () => void
}

/**
 * The foot of Today. The "Review" door that stood here moved into the page's
 * ⋯ menu (2026-09-21): unfinished work has ONE entrance on the page — the
 * Planning panel's fold — and the morning review ritual is reached from the
 * menu, not from a second line under the day. Only "New from email" remains,
 * because it is perishable: a one-time look at what arrived on its own.
 *
 * History, kept for the reasoning. It used to be a readout — "8 carried over
 * · 24 need attention · oldest 248 days" — with the carried-over segment expanding its own list inline. That
 * scoreboard was the problem. The counts never drained fast enough to feel
 * like progress, "oldest 248 days" read as an accusation rather than a
 * pointer, and the inline list re-imported the backlog into the day. Today is
 * a commitment surface; a running tally of everything you have not done is not
 * a commitment.
 *
 * The floor guarantee, inherited from AttentionLine (and before it,
 * SlippedPointer), survives untouched: work leaves Today on its own — dates
 * expire, backlog never appears here at all — so the pointer back to it must
 * be impossible to lose. Whenever either set is non-empty this renders, it has
 * no dismiss control, and it is one row at three items and one row at three
 * hundred. What changed is that the row no longer says how bad it is.
 *
 * Both populations resolve in one place: ReviewDrawer merges carried-over +
 * attention, deduped and oldest-first; the ⋯ menu's "Review carried-over
 * work" is the handle, and TodayInvariant.test.tsx pins that it is there at
 * 5 items and at 500 alike.
 */
export function TodayBacklogFooter({ onReviewEmail }: TodayBacklogFooterProps) {
  if (!onReviewEmail) return null

  return (
    // mb-[7.5rem] (mobile only): this is the last block on the mobile Today
    // page, so without real clearance it lands directly under the fixed
    // QuickCapture FAB (bottom-right) once the page is scrolled all the way
    // down — obscuring "Review", the one thing here a user can act on. The
    // value was verified in the browser to clear the FAB's ~5rem band with
    // margin to spare. Desktop has no FAB, hence md:mb-0.
    <div className="mb-[7.5rem] md:mb-0 flex items-center gap-4 px-3 md:px-0 py-2 mt-1">
      {/* Both links are the same quiet word-and-chevron. "New from email" sits
          FIRST because it is the perishable one: it is a one-time look at what
          arrived on its own, while Review is always there. Same weight, same
          colour — neither is a notification. */}
      {onReviewEmail && (
        <button
          type="button"
          onClick={onReviewEmail}
          className="ml-auto flex items-center gap-0.5 text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          New from email
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        </button>
      )}
    </div>
  )
}
