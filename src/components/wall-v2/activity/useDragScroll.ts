// Dragging the content itself to scroll it (Scott, 2026-11-10: "scrolling is
// well nigh impossible on ALL screens — there is a thin scroll bar that is
// almost impossible to grab"). The wall's touch frame reports a finger as a
// mouse, so the browser never pans: a press that moves more than a few pixels
// inside something that scrolls moves it, and the click that would follow is
// swallowed so a drag never presses a row. Real touch is left to the browser.
import { useEffect, type RefObject } from 'react'

const SLOP = 10

function scrollerFrom(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  for (let n = target instanceof HTMLElement ? target : null; n && root.contains(n); n = n.parentElement) {
    const s = getComputedStyle(n)
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n
    if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return n
  }
  return null
}

export function useDragScroll(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    let drag: { box: HTMLElement; x: number; y: number; top: number; left: number; moved: boolean } | null = null
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return
      const box = scrollerFrom(e.target, el)
      drag = box ? { box, x: e.clientX, y: e.clientY, top: box.scrollTop, left: box.scrollLeft, moved: false } : null
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < SLOP) return
      drag.moved = true
      drag.box.scrollTop = drag.top - dy
      drag.box.scrollLeft = drag.left - dx
    }
    const up = () => {
      if (drag?.moved) {
        const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      }
      drag = null
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [root])
}
