import { PlaceMedallion } from './PlaceMedallion'

/**
 * "Your place" across the app's edges: the place's scene as a shallow
 * landscape behind the desktop navigation band (its horizon) and behind the
 * footer (its ground), so the page is framed top and bottom (Scott,
 * 2026-09-23 — the place belongs to the whole app, not to one day's header).
 *
 * The scene keeps its proportions — it is the medallion at a larger size,
 * seen through a short, wide window — and fades out at both ends and toward
 * the page so labels stay readable.
 *
 * Decorative: aria-hidden, no pointer events. Render it BEFORE the content it
 * sits behind, with that content a `relative` sibling, so the content paints
 * over it without either making a stacking context.
 */
export function PlaceBand({ edge = 'top' }: { edge?: 'top' | 'bottom' }) {
  return (
    <div aria-hidden="true" className={`place-band place-band-${edge}`}>
      <div className="place-band-scene">
        <PlaceMedallion className="h-full w-full" />
      </div>
    </div>
  )
}
