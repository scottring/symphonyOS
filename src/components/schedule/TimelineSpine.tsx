/**
 * The timeline spine — a hairline through the marker column joining each timed
 * row to the next, so the day reads as one continuous thing rather than a
 * stack of unrelated lines.
 *
 * ONE segment per row, spanning that row's own height and over-reaching into
 * the space above and below it so neighbouring segments overlap into a
 * continuous line. The first shape this took drew two half-segments stopping
 * short of the marker, to avoid a line showing through the hollow check
 * circles — but their length was `calc(50% - 12px)` of the ROW, and Today's
 * rows range from 32px to 84px tall (a two-line time, a subtitle, a waiting
 * line). On a short row that resolves to zero and the spine vanished; on a
 * tall row whose marker is `self-start` it wasn't centred on the marker
 * anyway. Anchoring to a row's height cannot work when rows aren't one height.
 *
 * So the line simply runs behind the markers, which are already `z-[1]`. A
 * hairline crossing a hollow ring reads as the ring sitting ON the line, which
 * is the metaphor we wanted in the first place.
 *
 * The x-offset lives HERE rather than at each call site because it is the
 * single easiest thing in this codebase to get 13px wrong: pl-5 bulk gutter
 * (20) + w-16 time column (64) + gap-3 (12) puts the w-5 marker column at 96,
 * centred at 106. Without the bulk gutter every figure drops by 20. Verified
 * by measuring both against `getBoundingClientRect()` in the browser, which is
 * the only way this has ever been caught — see the agenda-grid note on
 * ScheduleItem.
 */
interface TimelineSpineProps {
  /** Continue up to the row above. False at the day's first timed row, and
   *  false below an open span — the line's break IS the gap. */
  above?: boolean
  /** Continue down to the row below. False at the day's last timed row, and
   *  false above an open span. */
  below?: boolean
  /** False on a row that renders without the bulk-select gutter. */
  hasBulkGutter?: boolean
}

export function TimelineSpine({ above, below, hasBulkGutter = true }: TimelineSpineProps) {
  // A single timed row, or one fenced by open space on both sides, connects to
  // nothing — a line with no other end is just a tick mark.
  if (!above && !below) return null
  return (
    <span
      aria-hidden
      data-testid="row-spine"
      className={`absolute ${hasBulkGutter ? 'left-[106px]' : 'left-[86px]'} w-px bg-neutral-200 ${
        above ? '-top-2' : 'top-1/2'
      } ${below ? '-bottom-2' : 'bottom-1/2'}`}
    />
  )
}
