/** Keep keyboard-focused controls above the scenery foreground. `clearance`
 * is how much of the scroller's bottom the foreground covers, in px — a
 * number, or a function read at focus time (the landscape's height follows
 * the window's width). */
export function keepFocusAboveScenery(scroller: HTMLElement, clearance: number | (() => number)) {
  const onFocus = (event: FocusEvent) => {
    const target = event.target
    if (!(target instanceof HTMLElement) || !scroller.contains(target)) return
    // Fixed and sticky chrome (navigation, the footer) is not scrolling page
    // content: it is never under the landscape.
    for (let el: HTMLElement | null = target; el && el !== scroller; el = el.parentElement) {
      const position = getComputedStyle(el).position
      if (position === 'fixed' || position === 'sticky') return
    }
    const covered = typeof clearance === 'function' ? clearance() : clearance
    const bottom = target.getBoundingClientRect().bottom
    const safeBottom = scroller.getBoundingClientRect().bottom - covered
    if (bottom > safeBottom) scroller.scrollTop += bottom - safeBottom + 16
  }
  scroller.addEventListener('focusin', onFocus)
  return () => scroller.removeEventListener('focusin', onFocus)
}
