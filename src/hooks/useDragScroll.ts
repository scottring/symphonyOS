import { useEffect, useRef } from 'react'

// Finger/mouse drag-to-scroll for a vertical container.
//
// Why this exists: the kitchen wall is a Raspberry Pi touchscreen whose
// compositor (labwc) delivers touch as *mouse* events. The browser therefore
// never sees real touch — so native touch scrolling and `touch-action` CSS
// never fire, and a finger drag reads as a mouse drag (which doesn't scroll
// anything). This hook makes the container scroll by dragging: it tracks
// pointer movement (mouse OR touch — pointer events unify both) and sets
// `scrollTop` directly, so a finger drag scrolls regardless of the platform.
//
// A short movement threshold keeps taps tap-able (so cards still open); once a
// drag is detected it captures the pointer and suppresses the trailing click
// so a scroll gesture never accidentally activates a card underneath the finger.

const DRAG_THRESHOLD_PX = 6

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let pointerId: number | null = null
    let startY = 0
    let startScrollTop = 0
    let dragging = false
    let suppressClick = false

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return
      pointerId = e.pointerId
      startY = e.clientY
      startScrollTop = el.scrollTop
      dragging = false
      suppressClick = false
    }

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return
      const dy = e.clientY - startY
      if (!dragging) {
        if (Math.abs(dy) < DRAG_THRESHOLD_PX) return
        dragging = true
        try { el.setPointerCapture(pointerId) } catch { /* not supported — fine */ }
      }
      el.scrollTop = startScrollTop - dy
      e.preventDefault()
    }

    const endDrag = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return
      if (dragging) {
        suppressClick = true // swallow the click this drag would otherwise fire
        try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
      }
      pointerId = null
      dragging = false
    }

    // Capture-phase click guard: if the gesture was a drag, eat the click so a
    // card underneath the finger doesn't open when the user meant to scroll.
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClick) {
        e.stopPropagation()
        e.preventDefault()
        suppressClick = false
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('click', onClickCapture, true)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  return ref
}
