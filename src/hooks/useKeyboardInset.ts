import { useEffect, useState } from 'react'

/**
 * How far the on-screen keyboard covers the bottom of the layout viewport, in
 * CSS px (0 when it is closed). Phone browsers leave `position: fixed; bottom:
 * 0` BEHIND the keyboard; the visual viewport is what shrinks. Anything that
 * must sit on the keyboard (the capture bar) adds this to its `bottom`.
 *
 * A shrink under 120px is browser chrome (the URL bar collapsing), not a
 * keyboard, and reads as 0.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!vv) return
    const update = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // Large text zooms the page; a `bottom` set inside it is in zoomed px.
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1
      setInset(covered < 120 ? 0 : Math.round(covered / zoom))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

/**
 * True while a text field has focus on a phone — the keyboard owns the bottom
 * edge then, so the dock steps aside (as the native app's does) and the
 * capture bar sits on the keyboard instead of above a dock.
 */
export function useTextEntryActive(): boolean {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const isText = (el: Element | null) =>
      !!el && (el instanceof HTMLTextAreaElement
        || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color'].includes(el.type))
        || (el instanceof HTMLElement && el.isContentEditable))
    const onFocus = () => setActive(isText(document.activeElement))
    // focusout fires before the next element takes focus; read it after.
    const onBlur = () => setTimeout(onFocus, 0)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
    }
  }, [])
  return active
}
