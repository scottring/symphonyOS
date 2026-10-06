import { formatOpenSpan, type OpenSpan } from '@/lib/today/openSpace'

/**
 * A hole in the day, named — one hairline rule across the gap between two
 * commitments, captioned with how long it runs and what closes it.
 *
 * Weight is the whole design here. This is the only line on Today that
 * describes something you have NOT committed to, so it has to read as the
 * page breathing rather than as another row: no background, no icon, no
 * affordance, rules that stop short of the container's edges. It should be
 * legible when you look for it and invisible when you don't — anything louder
 * and the empty part of the day starts outranking the full part.
 *
 * Dotted, not solid: a solid rule reads as a divider between two things, and
 * this is the opposite — the absence of anything. The timeline spine breaks
 * here for the same reason.
 */
export function OpenSpaceLine({ span }: { span: OpenSpan }) {
  // Drawn in the row grid (2026-10-06, "Today, calmer"): a short soft rule in
  // the time lane and the words where a title would start, so the free
  // stretch reads down the same edge as everything else instead of floating
  // mid-page between two dotted rules.
  return (
    <div
      data-testid="open-space-line"
      className="flex items-center gap-3 px-3 md:px-[13px] py-1.5 select-none"
    >
      <span className="hidden md:flex w-16 shrink-0 justify-end pr-2" aria-hidden>
        <span className="block h-6 w-0.5 rounded-full bg-primary-200" />
      </span>
      <span className="hidden md:block w-5 shrink-0" aria-hidden />
      <span className="text-[12.5px] font-medium text-primary-700 tabular-nums">
        {formatOpenSpan(span)}
      </span>
    </div>
  )
}
