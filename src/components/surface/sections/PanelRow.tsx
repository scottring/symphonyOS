import type { ReactNode } from 'react'

export interface PanelRowProps {
  /** Leading badge — pass the caller's tinted wrapper around a ConceptIcon. */
  icon: ReactNode
  onClick?: () => void
  /** When set, renders a link instead of a button. */
  href?: string
  /** Open the href in a new tab (the default for web links). Turn off for
   *  tel:/mailto: hrefs, which the OS hands off rather than navigating. */
  external?: boolean
  children: ReactNode
}

const ROW_CLASS =
  'flex items-start gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md ' +
  'bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50'

/**
 * One tappable line inside a PanelSection — a link, a related entity, a
 * suggestion. The chrome was character-identical in PanelLinks, PanelLinked and
 * PanelMightBeRelevant; three copies of a class string is three chances to drift.
 */
export function PanelRow({ icon, onClick, href, external = true, children }: PanelRowProps) {
  const body = (
    <>
      <span className="w-6 h-6 flex shrink-0 items-center justify-center rounded-md text-sm">
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={ROW_CLASS}
      >
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={ROW_CLASS}>
      {body}
    </button>
  )
}
