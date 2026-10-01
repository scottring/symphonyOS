// The one empty state (layout system, 2026-10-01): a serif line that says what
// is (or isn't) here, one sentence on what goes here, and at most one way to
// add it. Left-aligned in the column like everything else on the page — an
// empty page is still the page, not a centred poster.
import type { ReactNode } from 'react'

export function EmptyState({ title, children, action, className = '' }: {
  title: ReactNode
  /** One sentence: what lives here, or how to add the first one. */
  children?: ReactNode
  /** One quiet action (QuietAction or a text button). */
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`ds-empty ${className}`}>
      <p className="ds-empty-title">{title}</p>
      {children && <p className="ds-empty-body">{children}</p>}
      {action && <div className="ds-empty-action">{action}</div>}
    </div>
  )
}
