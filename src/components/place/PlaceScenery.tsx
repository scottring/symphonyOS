import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PlaceId } from '@/config/places'
import { usePlaceOrDefault } from '@/hooks/usePlace'
import { attachSceneryVeil } from './sceneryVeil'
import urbanLeft from '@/assets/scenery/urban-left.webp'
import urbanRight from '@/assets/scenery/urban-right.webp'
import urbanGround from '@/assets/scenery/urban-ground.webp'
import smallCityLeft from '@/assets/scenery/small-city-left.webp'
import smallCityRight from '@/assets/scenery/small-city-right.webp'
import smallCityGround from '@/assets/scenery/small-city-ground.webp'
import mountainTownLeft from '@/assets/scenery/mountain-town-left.webp'
import mountainTownRight from '@/assets/scenery/mountain-town-right.webp'
import mountainTownGround from '@/assets/scenery/mountain-town-ground.webp'
import cabinLeft from '@/assets/scenery/cabin-left.webp'
import cabinRight from '@/assets/scenery/cabin-right.webp'
import cabinGround from '@/assets/scenery/cabin-ground.webp'
import farmLeft from '@/assets/scenery/farm-left.webp'
import farmRight from '@/assets/scenery/farm-right.webp'
import farmGround from '@/assets/scenery/farm-ground.webp'

/**
 * "Your place" behind the page: the place's illustrated scene along the
 * bottom of the window, taller at both sides and dipping in the middle where
 * the page's content is (Scott, 2026-09-30 / 2026-10-01 — the scene should
 * stay recognisable while every pixel of the page goes to the work).
 *
 * The art is decoration only. It is fixed behind the page scroller, takes no
 * layout space (no band, no spacer), is aria-hidden and never takes a pointer.
 * A paper veil over it thickens as the page scrolls (sceneryVeil.ts), and the
 * page's own content column wears paper too (usePagePaper.ts), so text is never
 * set over the art at any scroll position.
 *
 * Render it as a sibling BEFORE the page scroller, with no z-index on either:
 * the scroller is positioned, so it paints after the scenery in DOM order and
 * nothing in the page gains or loses a stacking context — menus opened from
 * the page keep their z-index against the whole app.
 */

// Each place's scene, cut from the approved theme concepts
// (scripts/scenery/extract.py): two halves, each 514 source px wide and
// `height` tall, that stand in the bottom corners at one shared scale so
// their ground lines meet the same level; and a strip of the scene's own
// low ground (`groundHeight` source px tall), mirrored to tile, run across
// the middle between them.
const SCENERY: Record<PlaceId, { left: string; right: string; ground: string; height: number; groundHeight: number }> = {
  urban: { left: urbanLeft, right: urbanRight, ground: urbanGround, height: 470, groundHeight: 26 },
  'small-city': { left: smallCityLeft, right: smallCityRight, ground: smallCityGround, height: 402, groundHeight: 50 },
  'mountain-town': { left: mountainTownLeft, right: mountainTownRight, ground: mountainTownGround, height: 340, groundHeight: 38 },
  cabin: { left: cabinLeft, right: cabinRight, ground: cabinGround, height: 396, groundHeight: 54 },
  farm: { left: farmLeft, right: farmRight, ground: farmGround, height: 358, groundHeight: 54 },
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function PlaceScenery({ scroller, right = 0, floor }: {
  /** The element that actually scrolls the page; its scroll drives the veil. */
  scroller: HTMLElement | null
  /** Width taken by a side pane on the right, so the scene ends where the page does. */
  right?: number
  /** What the scene stands on: the height of fixed chrome along the bottom
   *  (the phone's tab bar). Defaults to the desktop footer, in CSS. */
  floor?: string
}) {
  const place = usePlaceOrDefault()
  const art = SCENERY[place]
  const ref = useRef<HTMLDivElement>(null)
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
    // one steady, stronger coverage instead.
    if (!el || !scroller || reducedMotion) return
    return attachSceneryVeil(scroller, el)
  }, [scroller, reducedMotion])

  const style = {
    right,
    ...(floor ? { '--scenery-floor': floor } : {}),
    '--scenery-rise': art.height,
    '--scenery-ground': `url(${art.ground})`,
    '--scenery-ground-rise': art.groundHeight,
  } as CSSProperties

  return (
    <div ref={ref} aria-hidden="true" className="place-scenery" data-place-scenery={place} style={style}>
      <div className="place-scenery-ground">
        <div className="place-scenery-strip" />
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
