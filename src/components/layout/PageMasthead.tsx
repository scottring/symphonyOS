//
// The masthead for a page that is neither a period nor a library surface —
// Goals, and whatever else still mounts it. Since the parity pass
// (2026-09-17) every OTHER page wears MastheadCard's open variant, so this
// wears the same shell: the rule above, the serif title, the hairline below,
// and a QUIET action on the right (text + icon, no filled pill).
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function PageMasthead({ title, description, actions }: {
  title: string
  /** One muted sentence — what lives here, or the count. */
  description?: ReactNode
  /** Right-side controls. Prefer <QuietAction>; at most one filled primary. */
  actions?: ReactNode
}) {
  return (
    <div className="daybook-masthead daybook-masthead-page">
      <div className="daybook-masthead-inner">
        {/* pr-12 on a phone: the life-area lens rides in the top-right corner. */}
        <div className="flex items-start justify-between gap-3 pr-12 md:pr-0">
          <h1 className="daybook-title min-w-0 flex-1">{title}</h1>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {description && <p className="mt-1 text-[14px] text-neutral-500">{description}</p>}
      </div>
    </div>
  )
}

/** The standard quiet page action — Documents' "+ Add" made shareable. */
export function QuietAction({ icon: Icon, label, onClick, disabled, ariaLabel }: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className="flex items-center gap-1.5 rounded-md px-3 py-2 text-[14px] text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-50"
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}
