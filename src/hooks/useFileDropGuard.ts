import { useEffect } from 'react'

/** Does this drag carry OS files (as opposed to an internal item drag)? */
function isFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Stop a stray file drop from navigating the tab away from the app.
 *
 * The browser's default action for a file dropped on a page is to open that
 * file — replacing the app, and whatever unsaved state was in it. Before this,
 * only the Photos & files section called `preventDefault`, which was 200px of a
 * 1237px detail panel (measured 2026-08-03). A near-miss silently threw you out
 * of Symphony, which reads as "the drop zone ignored my PDF".
 *
 * Two deliberate narrowings:
 *
 *  - **Only file drags.** Internal item drags — dnd-kit on Today, the planning
 *    grids, the routines canvas — carry their own MIME types and must pass
 *    through completely untouched.
 *  - **Only when nothing else claimed the drop.** These listeners sit on
 *    `window` in the bubble phase, so a real drop zone has already run and
 *    called `preventDefault`. Checking `defaultPrevented` means the guard never
 *    overrides a genuine target; it only catches what would otherwise fall
 *    through to the browser.
 *
 * Outside a real zone the cursor shows "not allowed" (`dropEffect = 'none'`),
 * so a miss looks like a refusal instead of silently doing nothing.
 */
export function useFileDropGuard(): void {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e) || e.defaultPrevented) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e) || e.defaultPrevented) return
      e.preventDefault()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])
}
