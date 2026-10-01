import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { usePlaceOrDefault } from '@/hooks/usePlace'
import { attachSceneryVeil } from './sceneryVeil'
import { SCENERY } from './sceneryArt'
/**
 * "Your place" behind the page: the place's illustrated scene along the
 * bottom of the window, taller at both sides and dipping in the middle where
 * the page's content is (Scott, 2026-09-30 / 2026-10-01 — the scene should
 * stay recognisable while every pixel of the page goes to the work).
 *
 * The art is decoration only. It is fixed behind the page scroller, takes no
 * layout space (no band, no spacer), is aria-hidden and never takes a pointer.
 * A paper veil over it thickens as the page scrolls, and as soon as the page's
 * marked content (useSceneryContent.ts) reaches up the corners' rise
 * (sceneryVeil.ts), so text is never set over it at any scroll position.
 *
 * Render it as a sibling BEFORE the page scroller, with no z-index on either:
 * the scroller is positioned, so it paints after the scenery in DOM order and
 * nothing in the page gains or loses a stacking context — menus opened from
 * the page keep their z-index against the whole app.
 *
 * The low ground between the corners is drawn separately, IN FRONT of the
 * page (PlaceGroundStrip, rendered after the scroller): the page's rows
 * scroll behind it as behind a low hill, so it can stay on every day without
 * any text ever sitting on it (Scott, 2026-10-01).
 */

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function PlaceScenery({ scroller, right = 0, floor, ground = null }: {
  /** The element that actually scrolls the page; its scroll drives the veil. */
  scroller: HTMLElement | null
  /** Width taken by a side pane on the right, so the scene ends where the page does. */
  right?: number
  /** What the scene stands on: the height of fixed chrome along the bottom
   *  (the phone's tab bar). Defaults to the desktop footer, in CSS. */
  floor?: string
  /** The ground strip in front of the page (PlaceGroundStrip), so it recedes
   *  with the rest of the scene as the page scrolls. */
  ground?: HTMLElement | null
}) {
  const place = usePlaceOrDefault()
  const art = SCENERY[place]
  const ref = useRef<HTMLDivElement>(null)
  const groundRef = useRef<HTMLDivElement>(null)
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const onChange = () => setReducedMotion(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    const el = ref.current
    // Reduced motion: no scroll-linked change at all — CSS holds the veil at
    // one steady coverage strong enough for text over the art.
    if (!el || !scroller || reducedMotion) return
    return attachSceneryVeil(scroller, ground ? [el, ground] : el, groundRef.current)
  }, [scroller, reducedMotion, ground])

  const style = {
    right,
    ...(floor ? { '--scenery-floor': floor } : {}),
    '--scenery-rise': art.height,
  } as CSSProperties

  return (
    <div ref={ref} aria-hidden="true" className="place-scenery" data-place-scenery={place} style={style}>
      <div ref={groundRef} className="place-scenery-ground">
        <div className="place-scenery-corner is-left">
          <img className="place-scenery-art" src={art.left} alt="" decoding="async" draggable={false} />
        </div>
        <div className="place-scenery-corner is-right">
          <img className="place-scenery-art" src={art.right} alt="" decoding="async" draggable={false} />
        </div>
      </div>
      <div className="place-scenery-veil" />
    </div>
  )
}

/**
 * The scene's low ground across the middle, in front of the page: a strip of
 * the place's own ground (stream, wheat, river...) with a short paper fade
 * above it, so rows scrolling down slip behind it instead of over art. Fixed,
 * out of layout, aria-hidden and pointer-transparent; its ends fade into the
 * corners' slopes. Render it AFTER the page scroller.
 */
export function PlaceGroundStrip({ right = 0, floor, stripRef }: {
  right?: number
  floor?: string
  stripRef?: (el: HTMLDivElement | null) => void
}) {
  const art = SCENERY[usePlaceOrDefault()]
  const style = {
    right,
    ...(floor ? { '--scenery-floor': floor } : {}),
    '--scenery-ground': `url(${art.ground})`,
    '--scenery-ground-rise': art.groundHeight,
  } as CSSProperties
  return (
    <div ref={stripRef} aria-hidden="true" className="place-ground-strip" style={style}>
      <div className="place-ground-strip-band" />
    </div>
  )
}
