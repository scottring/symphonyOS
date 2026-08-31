import { formatOpenSpan, type OpenSpan } from '@/lib/today/openSpace'

/**
 * A hole in the day, named — one hairline rule across the gap between two
 * commitments, captioned with how long it runs and what closes it.
 *
 * Weight is the whole design here. This is the only line on Today that
 * describes something you have NOT committed to, so it has to read as the
 * page breathing rather than as another row: no background, no icon, no
 * affordance, hairlines that stop short of the container's edges. It should be
 * legible when you look for it and invisible when you don't — anything louder
 * and the empty part of the day starts outranking the full part.
 */
export function OpenSpaceLine({ span }: { span: OpenSpan }) {
  return (
    <div
      data-testid="open-space-line"
      className="flex items-center gap-3 px-3 md:px-0 py-2.5 select-none"
    >
      <span className="flex-1 h-px bg-neutral-200/70" aria-hidden />
      <span className="shrink-0 text-[12px] text-neutral-400 tabular-nums">
        {formatOpenSpan(span)}
      </span>
      <span className="flex-1 h-px bg-neutral-200/70" aria-hidden />
    </div>
  )
}
