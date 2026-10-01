// How far the page has scrolled, handed to the scenery as one CSS number.
//
// The scenery behind the page (PlaceScenery) sits under a paper veil. At the
// top of the page the veil is thin and the place shows in the unused space;
// over the first SCENERY_VEIL_DISTANCE px of scroll it thickens toward solid
// paper, so the art recedes once the page is being worked in. The veil's
// opacity is worked out in CSS from --scenery-progress (0 → 1); this file only
// writes that number — at most once a frame, and never through React state,
// so scrolling re-renders nothing.

export const SCENERY_VEIL_DISTANCE = 150

/** 0 at the top of the page, 1 once it has scrolled `distance` px or more. */
export function veilProgress(scrollTop: number, distance = SCENERY_VEIL_DISTANCE): number {
  if (!(scrollTop > 0) || !(distance > 0)) return 0
  return Math.min(1, scrollTop / distance)
}

/**
 * Keep `target`'s --scenery-progress in step with `scroller`'s scroll
 * position. Returns the cleanup.
 */
export function attachSceneryVeil(scroller: HTMLElement, target: HTMLElement): () => void {
  let frame = 0
  let written = -1
  const write = () => {
    frame = 0
    // Hundredths: finer steps are invisible and would only cost style work.
    const progress = Math.round(veilProgress(scroller.scrollTop) * 100) / 100
    if (progress === written) return
    written = progress
    target.style.setProperty('--scenery-progress', String(progress))
  }
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(write)
  }
  write()
  scroller.addEventListener('scroll', onScroll, { passive: true })
  return () => {
    scroller.removeEventListener('scroll', onScroll)
    if (frame) cancelAnimationFrame(frame)
    target.style.removeProperty('--scenery-progress')
  }
}
