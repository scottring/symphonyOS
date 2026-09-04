import type { ReactNode, Ref } from 'react'
import { PlaceWash } from '@/components/place/PlaceWash'

/**
 * Hairline rules with even vertical padding, and no padding at the ends. Applied
 * to the article AND to each zone, so a zone holding several sections spaces
 * them exactly the way the zones themselves are spaced.
 */
const RHYTHM =
  'divide-y divide-neutral-200/60 [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0'

export interface PanelShellProps {
  identity: ReactNode
  act?: ReactNode
  classify?: ReactNode
  details?: ReactNode
  related?: ReactNode
  footer?: ReactNode
  /** Forwarded to the <article> — the task and event panels use it as the file drop zone. */
  innerRef?: Ref<HTMLElement>
  /** Rendered outside the divided flow: overlays, drawers, portaled chrome. */
  children?: ReactNode
}

/**
 * The detail panel's chrome and zone order, in one place.
 *
 * Panels used to style themselves, and drifted into three rhythms in one app:
 * task and event on hairline dividers with even padding, routine on p-5 and meal
 * on p-6 with none. A panel now supplies zones; the order and the spacing are
 * not its business.
 *
 * A zone that renders nothing draws nothing — no empty wrapper — so `divide-y`
 * never lays down a hairline with nothing on either side of it. Pass `undefined`
 * for an unused zone, not an empty fragment: a fragment is still a zone.
 */
export function PanelShell({
  identity,
  act,
  classify,
  details,
  related,
  footer,
  innerRef,
  children,
}: PanelShellProps) {
  const zones: ReactNode[] = [identity, act, classify, details, related, footer]

  return (
    <article
      ref={innerRef}
      className={`relative isolate overflow-hidden bg-bg-elevated max-w-md w-full rounded-2xl px-4 md:px-5 py-3 md:py-5 ${RHYTHM}`}
    >
      {/* The panel wears the user's Place, same as Today's day card. Top-anchored
          so the medallion sits behind the identity zone, not the reading column. */}
      <PlaceWash anchor="top" opacity={0.14} />

      {zones.map((zone, i) =>
        // The rhythm repeats INSIDE a zone: `details` holds many sections, and
        // without it Phone and Notes butt together with no rule between them
        // while zones a single section wide keep their breathing room.
        zone == null || zone === false ? null : (
          // `empty:hidden` is load-bearing, not defensive. A zone is usually a
          // fragment of sections that each decide for themselves whether to
          // render — `related` on a task with no project and no suggestions is a
          // truthy fragment that produces nothing — and a wrapper with no
          // children still draws a divider and a chunk of padding.
          <div key={i} className={`${RHYTHM} empty:hidden`}>
            {zone}
          </div>
        ),
      )}
      {children}
    </article>
  )
}
