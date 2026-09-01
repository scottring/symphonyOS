//
// The one masthead every Library page shares (design-unification 2026-09-01).
// Grammar taken from Documents/Notes — the pages that already looked like the
// app: a Source Serif title, a muted one-line description under it, and a
// QUIET action on the right (text + icon, no filled pill). Today and This
// Week keep their bespoke date mastheads (HomeHeader); everything else that
// is a page uses this.
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
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-3xl font-display text-neutral-900">{title}</h1>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {description && <p className="text-[14px] text-neutral-500">{description}</p>}
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
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] text-primary-700 hover:bg-primary-50 disabled:opacity-50 transition-colors"
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}
