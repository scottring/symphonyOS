import type { ReactNode, Ref } from 'react'

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
      className="
        bg-bg-elevated max-w-md w-full
        rounded-2xl
        px-4 md:px-5 py-3 md:py-5
        divide-y divide-neutral-200/60
        [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0
      "
    >
      {zones.map((zone, i) =>
        zone == null || zone === false ? null : <div key={i}>{zone}</div>,
      )}
      {children}
    </article>
  )
}
