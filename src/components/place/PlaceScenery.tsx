import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { usePlaceOrDefault } from '@/hooks/usePlace'
import { sceneryArt } from './panoramas'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'
import { keepFocusAboveScenery } from './sceneryFocus'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** The place's landscape, standing along the bottom of the window in front of
 * the page (index.css, IMMERSIVE SCENERY). The sky itself is the shell's
 * background; this draws more of the same sky through the painting's veil
 * (content slips behind it as it nears the skyline), then the one painting.
 * Below the skyline a catcher takes the pointer, so concealed rows cannot be
 * clicked, and forwards wheel and touch scrolling to the page. How much of
 * the window that conceals becomes the scroller's --scenery-clearance, so
 * every final row and focused control can be brought clear of it.
 */
/** Source px the veil fades over above the skyline, in the art's 1506px
 * width (scripts/scenery/extract_landscapes.py, FADE). Only the ratio
 * matters: the woodblock veils fade over the same share of their width. */
const VEIL_FADE = 64
const ART_WIDTH = 1506
/** Faint: the scene stands at the END of the page, below the content (never
 * behind it — review, 2026-10-07), softened, taking no pointer; a short page
 * still sets it on the window's bottom edge (index.css). It is the default (Scott, 2026-10-03: "I may like the
 * higher transparency, low opacity look better than the default"); a person
 * who chose the full scene still gets faint on a short desktop window (a
 * laptop), where the landscape took a quarter of the height. */
export const FAINT_SCENERY_QUERY = '(min-width: 768px) and (max-height: 1000px)'
const FAINT_CLEARANCE = 16

export function PlaceScenery({ scroller, right = 0, floor }: {
  scroller: HTMLElement | null
  right?: number
  floor?: string
}) {
  const place = usePlaceOrDefault()
  const { showScenery, sceneryLighting, sceneryStyle, sceneryScene } = useSceneryPreferences()
  const art = sceneryArt(sceneryStyle, place, sceneryLighting)
  const box = useRef<HTMLDivElement>(null)
  const catcher = useRef<HTMLDivElement>(null)
  // How much of the window's bottom the scene conceals (over the text
  // column), kept outside React state: it follows the window's width.
  const height = useRef(0)
  const shortWindow = useMediaQuery(FAINT_SCENERY_QUERY)
  const faint = sceneryScene === 'faint' || shortWindow

  useEffect(() => {
    const el = box.current
    const below = catcher.current
    if (!el || !below || !scroller || !showScenery) return
    const write = () => {
      const width = el.getBoundingClientRect().width
      height.current = faint ? FAINT_CLEARANCE : below.getBoundingClientRect().height + VEIL_FADE * width / ART_WIDTH
      scroller.style.setProperty('--scenery-clearance', `${Math.round(height.current)}px`)
    }
    write()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(write) : null
    observer?.observe(el)
    return () => {
      observer?.disconnect()
      scroller.style.removeProperty('--scenery-clearance')
    }
  }, [scroller, showScenery, art, faint])

  useEffect(() => {
    if (!scroller || !showScenery) return
    // Whatever the landscape covers, plus the floor it stands on (the phone's
    // dock), is out of sight for a keyboard user.
    return keepFocusAboveScenery(scroller, () => {
      const el = box.current
      if (!el) return 0
      return height.current + (window.innerHeight - el.getBoundingClientRect().bottom)
    })
  }, [scroller, showScenery])

  useEffect(() => {
    const el = catcher.current
    if (!el || !scroller || !showScenery) return
    // Fixed descendants do not reliably participate in native scroll
    // chaining. Forward only gestures over this noninteractive foreground.
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return // preserve browser pinch-to-zoom
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1
      scroller.scrollTop += event.deltaY * unit
    }
    let y: number | null = null
    const start = (event: TouchEvent) => { y = event.touches.length === 1 ? event.touches[0].clientY : null }
    const move = (event: TouchEvent) => {
      if (y === null || event.touches.length !== 1) return
      event.preventDefault()
      const next = event.touches[0].clientY
      scroller.scrollTop += y - next
      y = next
    }
    const end = () => { y = null }
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [scroller, showScenery])

  if (!showScenery) return null
  const css = {
    right,
    '--scenery-veil': `url(${art.veil})`,
    '--scenery-art': `url(${art.src})`,
    ...(floor ? { '--scenery-floor': floor } : {}),
  } as CSSProperties
  return (
    <div ref={box} aria-hidden="true" className={`place-scenery${faint ? ' is-faint' : ''}`} data-place-scenery={place} data-lighting={sceneryLighting} data-style={sceneryStyle} style={css}>
      <div className="place-scenery-veil" />
      <img className="place-scenery-panorama" src={art.src} alt="" decoding="async" draggable={false} />
      <div className="place-scenery-haze" />
      <div ref={catcher} className="place-scenery-catch" style={{ height: `${(1 - art.skyline) * 100}%` }} />
    </div>
  )
}
