import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { backgroundArt } from './panoramas'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'

/** How far the print reaches past the heading to the page's own edges:
 * the heading sits inside the page's margins, the print runs corner to
 * corner across the top of the sheet (Scott, 2026-11-13). */
function bleedTo(print: HTMLElement) {
  const heading = print.parentElement
  const page = print.closest<HTMLElement>('.paper-fold-current')
  if (!heading || !page) return
  const h = heading.getBoundingClientRect()
  const p = page.getBoundingClientRect()
  const px = (n: number) => `${Math.max(0, Math.round(n))}px`
  print.style.setProperty('--heading-print-top', px(h.top - p.top))
  print.style.setProperty('--heading-print-left', px(h.left - p.left))
  print.style.setProperty('--heading-print-right', px(p.right - h.right))
}

/** The chosen print across the top of Today's page: faint behind the date
 * and the day's sentence on the left, full strength on the right, over the
 * place's own sky (the overlook has none of its own). It runs from corner
 * to corner of the sheet, not just the heading's text column. It is the
 * page's one picture: Today shows no landscape at its foot (ShellLayout).
 * The Scenery switch turns it off with the landscape. Decorative only. */
export function HeadingPrint() {
  const { showScenery, sceneryBackground } = useSceneryPreferences()
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const print = ref.current
    if (!print) return
    const measure = () => bleedTo(print)
    measure()
    const page = print.closest<HTMLElement>('.paper-fold-current')
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    if (page) ro.observe(page)
    if (print.parentElement) ro.observe(print.parentElement)
    return () => ro.disconnect()
  }, [showScenery])

  if (!showScenery) return null
  const art = backgroundArt(sceneryBackground)
  return (
    <div ref={ref} className="heading-print" aria-hidden="true" data-testid="heading-print" data-background={sceneryBackground}
      style={{ '--heading-print-focus': art.headingFocus ?? 'center 30%' } as CSSProperties}>
      <img src={art.headingSrc ?? art.src} alt="" draggable={false} />
    </div>
  )
}
