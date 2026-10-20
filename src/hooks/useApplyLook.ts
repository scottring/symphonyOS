// Mirrors the look (Classic or Landscape) and the Landscape palette onto
// <html data-look data-palette>, so src/styles/landscape.css re-tints the
// whole app — portalled menus and dialogs included — with no reload. The
// Landscape look's title face, Fraunces, is fetched only once someone
// switches to it.
import { useEffect } from 'react'
import { useSceneryPreferences } from './useSceneryPreferences'

const FONT_LINK_ID = 'symphony-landscape-font'
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..700,0..100&display=swap'

export function useApplyLook() {
  const { look, palette } = useSceneryPreferences()
  useEffect(() => {
    const root = document.documentElement
    if (look === 'landscape') {
      root.dataset.look = 'landscape'
      root.dataset.palette = palette
      if (!document.getElementById(FONT_LINK_ID)) {
        const link = document.createElement('link')
        link.id = FONT_LINK_ID
        link.rel = 'stylesheet'
        link.href = FONT_HREF
        document.head.appendChild(link)
      }
    } else {
      delete root.dataset.look
      delete root.dataset.palette
    }
  }, [look, palette])
}
