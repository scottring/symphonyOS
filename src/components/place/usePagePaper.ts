import { useEffect } from 'react'

/**
 * For a page whose content column wears the paper (`.place-paper`): while it
 * is mounted the scenery may show at full strength in the space the page
 * leaves unused, because the column itself keeps text off the art. Pages that
 * don't opt in get a quieter scene, so none of their text lands on busy art.
 */
export function usePagePaper() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('has-place-paper')
    return () => root.classList.remove('has-place-paper')
  }, [])
}
