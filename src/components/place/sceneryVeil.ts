// How much paper to lay over the scenery, handed to it as one CSS number.
//
// The scenery behind the page (PlaceScenery) sits under a paper veil, thin at
// rest so the place shows in the space the page leaves empty. Two things
// thicken it toward solid paper:
//
//  - scrolling: over the first SCENERY_VEIL_DISTANCE px the art recedes, once
//    the page is being worked in;
//  - the page's own content reaching up into the corners' rise: no row may
//    sit over the art. Every decorative layer stays behind the page.
//
// The veil's opacity is worked out in CSS from --scenery-progress (0 → 1);
// this file only writes that number — at most once a frame, never through
// React state, so scrolling re-renders nothing.

export const SCENERY_VEIL_DISTANCE = 150
/** How far content may run into the scene before the art is fully veiled. */
export const SCENERY_CONTENT_DISTANCE = 96

/** The element a page marks as its content (see useSceneryContent). */
export const SCENERY_CONTENT_SELECTOR = '[data-scenery-content]'
/** Fired on window when a page's marked content mounts or unmounts. */
export const SCENERY_CONTENT_EVENT = 'symphony:scenery-content'

/** 0 at the top of the page, 1 once it has scrolled `distance` px or more. */
export function veilProgress(scrollTop: number, distance = SCENERY_VEIL_DISTANCE): number {
  if (!(scrollTop > 0) || !(distance > 0)) return 0
  return Math.min(1, scrollTop / distance)
}

/**
 * How tall a corner of the scene stands at fraction `f` of its width,
 * measured from the window's outer edge (0) toward the middle (1), as a
 * fraction of the corner's height. Mirrors the slope the art is cut to
 * (scripts/scenery/extract.py, inner_fade): full height for the outer half,
 * then settling down to nothing just short of the inner edge.
 */
export function cornerRise(f: number): number {
  if (f <= 0.52) return 1
  if (f >= 0.98) return 0
  return 1 - ((f - 0.52) / 0.46) ** (1 / 1.6)
}

/** 0 while the content ends above the scene's top, rising to 1 as it runs
 *  `distance` px down into it. */
export function contentProgress(contentBottom: number, sceneTop: number, distance = SCENERY_CONTENT_DISTANCE): number {
  const overlap = contentBottom - sceneTop
  if (!(overlap > 0) || !(distance > 0)) return 0
  return Math.min(1, overlap / distance)
}

/**
 * Keep `target`'s --scenery-progress in step with `scroller`'s scroll position
 * and with how far the page's marked content reaches into `scene` (the art's
 * bounding box). Returns the cleanup.
 */
export function attachSceneryVeil(scroller: HTMLElement, target: HTMLElement | HTMLElement[], scene: HTMLElement | null = null): () => void {
  const targets = Array.isArray(target) ? target : [target]
  let frame = 0
  let written = -1
  let content: Element | null = null
  // Content grows and shrinks without scrolling (a task added, a section
  // folded): watch its size too.
  const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null

  // Where the page's content ends: its lowest child, not its box — padding
  // and spacers are empty page, and fixed bars ride elsewhere.
  const contentBottom = (el: Element) => {
    let bottom = -Infinity
    for (const child of Array.from(el.children)) {
      if (child.getAttribute('aria-hidden') === 'true') continue
      if (getComputedStyle(child).position === 'fixed') continue
      bottom = Math.max(bottom, child.getBoundingClientRect().bottom)
    }
    return bottom
  }

  // The top of the corners where the content stands over them: they rise
  // toward the window's edges, so only the content's own outer edges can
  // meet the tall part.
  const cornerTopUnder = (el: Element, sceneEl: HTMLElement) => {
    const ground = sceneEl.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const left = box.left + (parseFloat(style.paddingLeft) || 0)
    const right = box.right - (parseFloat(style.paddingRight) || 0)
    let rise = 0
    for (const corner of Array.from(sceneEl.querySelectorAll('.place-scenery-corner'))) {
      const c = corner.getBoundingClientRect()
      if (!(c.width > 0)) continue
      const isLeft = c.left <= ground.left + 1
      const edge = isLeft ? left - c.left : c.right - right
      rise = Math.max(rise, c.height * cornerRise(edge / c.width))
    }
    return rise > 0 ? ground.bottom - rise : Infinity
  }

  const write = () => {
    frame = 0
    const found = scroller.querySelector(SCENERY_CONTENT_SELECTOR)
    if (found !== content) {
      if (content) resize?.unobserve(content)
      content = found
      if (content) resize?.observe(content)
    }
    let progress = veilProgress(scroller.scrollTop)
    if (content && scene) {
      progress = Math.max(progress, contentProgress(contentBottom(content), cornerTopUnder(content, scene)))
    }
    // Hundredths: finer steps are invisible and would only cost style work.
    progress = Math.round(progress * 100) / 100
    if (progress === written) return
    written = progress
    for (const t of targets) t.style.setProperty('--scenery-progress', String(progress))
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(write)
  }

  write()
  scroller.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  window.addEventListener(SCENERY_CONTENT_EVENT, schedule)
  return () => {
    scroller.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    window.removeEventListener(SCENERY_CONTENT_EVENT, schedule)
    resize?.disconnect()
    if (frame) cancelAnimationFrame(frame)
    for (const t of targets) t.style.removeProperty('--scenery-progress')
  }
}
