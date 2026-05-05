import type { ReactNode } from 'react'

/**
 * ExpandingPanel — smoothly animates content from collapsed (0 height)
 * to its natural content height. Used for hover-revealed banners and
 * detail rows where the surrounding layout must shift gracefully.
 *
 * Implementation note: CSS cannot animate `height: 0 → auto` directly.
 * We use the modern grid-template-rows trick: the outer grid animates
 * between `0fr` and `1fr`, and the inner div (`min-h-0 overflow-hidden`)
 * is the actual clipping container. Supported in evergreen browsers
 * (Chrome 117+, Safari 17+, Firefox 124+).
 *
 * Why a single `open` prop and not `:hover` CSS? React state lets the
 * component cleanly mount/unmount and gives callers control over the
 * trigger (hover, focus, data-driven, etc.). It also avoids relying on
 * Tailwind JIT discovering dynamic group-hover variants.
 */
interface ExpandingPanelProps {
  children: ReactNode
  /** When true, the panel is expanded; when false, collapsed. */
  open: boolean
  /** Animation duration in ms. Defaults to 200ms (informational chrome). */
  durationMs?: number
  /** Extra className applied to the outer (animating) wrapper. */
  className?: string
  /** Extra className applied to the inner content container. */
  innerClassName?: string
}

export function ExpandingPanel({
  children,
  open,
  durationMs = 200,
  className = '',
  innerClassName = '',
}: ExpandingPanelProps) {
  return (
    <div
      className={`grid ${className}`}
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        transitionProperty: 'grid-template-rows',
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      aria-hidden={!open}
    >
      <div className={`min-h-0 overflow-hidden ${innerClassName}`}>
        {children}
      </div>
    </div>
  )
}
