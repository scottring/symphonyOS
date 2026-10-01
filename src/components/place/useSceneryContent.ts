import { useEffect } from 'react'
import { SCENERY_CONTENT_EVENT } from './sceneryVeil'

/**
 * For a page that marks its content column with `data-scenery-content`:
 * while it is mounted the scenery may show at full strength in the space the
 * page leaves empty, because the veil thickens as soon as that column reaches
 * down into the art (sceneryVeil.ts). Pages that don't opt in get a quieter
 * scene, so none of their text lands on busy art.
 */
export function useSceneryContent() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('has-scenery-content')
    window.dispatchEvent(new Event(SCENERY_CONTENT_EVENT))
    return () => {
      root.classList.remove('has-scenery-content')
      window.dispatchEvent(new Event(SCENERY_CONTENT_EVENT))
    }
  }, [])
}
