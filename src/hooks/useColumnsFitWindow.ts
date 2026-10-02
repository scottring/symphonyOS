import { useLayoutEffect, type RefObject } from 'react'

/** Below this the columns stack and the page scrolls as one (index.css,
 * `.pv2-wgrid` at max-width 860px). */
const SIDE_BY_SIDE = '(min-width: 861px)'
/** A column never gets shorter than this; a very short window scrolls the
 * page as well, rather than leaving a sliver of list. */
const MIN_HEIGHT = 360
/** Breathing room between a column's last row and the landscape's veil. */
const GAP = 12

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

/** Side-by-side planning columns scroll on their own (Scott, 2026-10-02): the
 * grid gets `--pv2-col-h`, the room from its top to the bottom of the window,
 * less the landscape that stands there (--scenery-clearance). The heading and
 * masthead stay put above it. Re-measured when the window or anything above
 * the grid changes size. */
export function useColumnsFitWindow(grid: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const el = grid.current
    if (!el || !enabled) return
    const scroller = scrollParent(el)
    const wide = window.matchMedia(SIDE_BY_SIDE)
    const measure = () => {
      if (!wide.matches || !scroller) { el.style.removeProperty('--pv2-col-h'); return }
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      const clearance = parseFloat(getComputedStyle(scroller).getPropertyValue('--scenery-clearance')) || 0
      const room = scroller.clientHeight - top - clearance - GAP
      el.style.setProperty('--pv2-col-h', `${Math.max(MIN_HEIGHT, Math.round(room))}px`)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (scroller) {
      observer?.observe(scroller)
      // Whatever sits above the grid (masthead, guide bar) moving its top.
      if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild)
    }
    // The landscape writes its height (--scenery-clearance) onto the scroller's
    // style after it lays out, and again when the place or light changes.
    const restyled = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null
    if (scroller) restyled?.observe(scroller, { attributes: true, attributeFilter: ['style'] })
    wide.addEventListener('change', measure)
    return () => {
      observer?.disconnect()
      restyled?.disconnect()
      wide.removeEventListener('change', measure)
      el.style.removeProperty('--pv2-col-h')
    }
  }, [grid, enabled])
}
