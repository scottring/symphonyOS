import type { CSSProperties } from 'react'
import { backgroundArt } from './panoramas'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'

/** The chosen print across Today's heading (Scott, 2026-11-13): faint behind
 * the date and the day's sentence on the left, full strength on the right,
 * over the place's own sky (the overlook has none of its own). It is the
 * page's one picture: Today shows no landscape at its foot (ShellLayout).
 * The Scenery switch turns it off with the landscape. Decorative only. */
export function HeadingPrint() {
  const { showScenery, sceneryBackground } = useSceneryPreferences()
  if (!showScenery) return null
  const art = backgroundArt(sceneryBackground)
  return (
    <div className="heading-print" aria-hidden="true" data-testid="heading-print" data-background={sceneryBackground}
      style={{ '--heading-print-focus': art.headingFocus ?? 'center 30%' } as CSSProperties}>
      <img src={art.src} alt="" draggable={false} />
    </div>
  )
}
