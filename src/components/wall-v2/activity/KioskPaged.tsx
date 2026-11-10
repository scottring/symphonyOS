// Pages, not scrolling, for anything on the kitchen wall that can hold more
// than fits (Scott, 2026-11-10: "now do the other wall pages too, no
// scrolling"). The box shows what fits and hides the rest; when there is
// more, Previous and Next turn a whole page. A page starts at the first row
// the last one cut off, so nothing is read in halves.
//
// The box never scrolls by hand (overflow hidden); only the buttons move it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { nextPageTop } from '@/lib/wall/activity/pageTop'

/** Overflow smaller than this is rounding, not more content. */
const SLACK = 6

export function KioskPaged({ children, className = '', outerClassName = '', resetKey, label = 'Pages' }: {
  children: ReactNode
  /** The content's own layout classes, on the box that holds it. */
  className?: string
  outerClassName?: string
  /** A new key (another list, another day) starts again at page one. */
  resetKey?: unknown
  label?: string
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)
  const [back, setBack] = useState<number[]>([])
  const [more, setMore] = useState(false)

  const measure = useCallback(() => {
    const b = box.current
    if (!b) return
    if (b.scrollTop !== at) b.scrollTop = at
    setMore(b.scrollHeight - b.scrollTop - b.clientHeight > SLACK)
  }, [at])

  // A new list starts again at page one (set while rendering, React's way to
  // reset state when a prop changes).
  const [shownKey, setShownKey] = useState(resetKey)
  if (shownKey !== resetKey) { setShownKey(resetKey); setAt(0); setBack([]) }
  useLayoutEffect(() => { measure() })
  useEffect(() => {
    const b = box.current
    if (!b) return
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(b)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null
    mo?.observe(b, { childList: true, subtree: true, characterData: true })
    return () => { ro?.disconnect(); mo?.disconnect() }
  }, [measure])

  const next = () => {
    const b = box.current
    if (!b) return
    setBack((s) => [...s, b.scrollTop])
    setAt(nextPageTop(b))
  }
  const prev = () => {
    setAt(back[back.length - 1] ?? 0)
    setBack((s) => s.slice(0, -1))
  }
  const paged = more || back.length > 0
  return (
    <div className={`kp ${more ? 'has-more' : ''} ${outerClassName}`}>
      <div ref={box} className={`kp-box ${className}`}>{children}</div>
      {paged && (
        <nav className="kp-pager" aria-label={label}>
          <button type="button" className="kp-btn" disabled={back.length === 0} onClick={prev}><ChevronUp aria-hidden="true" />Previous</button>
          <span className="kp-where" aria-live="polite">Page {back.length + 1}{more ? '' : ' · the end'}</span>
          <button type="button" className="kp-btn" disabled={!more} onClick={next}>Next<ChevronDown aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  )
}
