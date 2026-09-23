import { PlaceSkyline } from './PlaceSkyline'

/**
 * "Your place" across the top of the app: the place's scene as a shallow
 * landscape behind the desktop navigation band (Scott, 2026-09-23 — the
 * place belongs to the whole app, not to one day's header).
 *
 * The art is the place's skyline silhouette (PlaceSkyline), drawn for this
 * wide, shallow band at its own proportions, fading out at both ends and into
 * the page so the navigation labels stay readable.
 *
 * Decorative: aria-hidden, no pointer events. Render it as the FIRST child of
 * the content frame, with the workspace after it as a `relative` sibling, so
 * the navigation paints over it without either making a stacking context.
 */
export function PlaceBand() {
  return (
    <div aria-hidden="true" className="place-band">
      <div className="place-band-scene">
        <PlaceSkyline className="h-full w-full" />
      </div>
    </div>
  )
}
