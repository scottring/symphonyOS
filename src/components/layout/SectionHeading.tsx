// The layout system's two heading levels (docs/design-system/LAYOUT-SYSTEM.md).
// Every page used to draw its own — serif 22, 20 and 17, caps 12 and 11, and
// a few one-offs — so the same idea ("this is a section") looked different on
// every page. Now there is one of each:
//
//   SectionHeading  a section of the page: serif over a hairline, with an
//                   optional quiet note or action on the right
//   GroupLabel      a group inside a section: small caps, no rule
import type { ReactNode } from 'react'

export function SectionHeading({ id, children, aside, as: Tag = 'h2', className = '' }: {
  id?: string
  children: ReactNode
  /** A quiet note or action on the right — "+ Add task", "(for reference)". */
  aside?: ReactNode
  as?: 'h2' | 'h3'
  className?: string
}) {
  return (
    <div className={`ds-section-heading ${className}`}>
      <Tag id={id}>{children}</Tag>
      {aside && <div className="ds-section-heading-aside">{aside}</div>}
    </div>
  )
}

export function GroupLabel({ children, aside, className = '', as: Tag = 'h3' }: {
  children: ReactNode
  /** A muted count or hint after the label, in sentence case. */
  aside?: ReactNode
  className?: string
  as?: 'h2' | 'h3' | 'h4' | 'div'
}) {
  return (
    <Tag className={`ds-group-label ${className}`}>
      {children}
      {aside && <span className="ds-group-label-aside">{aside}</span>}
    </Tag>
  )
}
