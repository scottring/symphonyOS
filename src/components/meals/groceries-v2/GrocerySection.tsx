import { useState, type ReactNode } from 'react'

interface Props {
  /** Section kicker label, e.g. "PRODUCE — FOR THE WEEK". Already-uppercase string. */
  label: string
  /** Item count rendered next to the kicker when collapsed. */
  count: number
  /** Whether to start expanded. First two sections are open by default per the design. */
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * GrocerySection — collapsible group of grocery line items in the v2 modal.
 *
 * Section kicker idiom: small uppercase tracking-wide label, with a count
 * in parentheses when collapsed. Click anywhere on the header row to toggle.
 */
export function GrocerySection({ label, count, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 py-2 group"
        aria-expanded={open}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500 group-hover:text-neutral-700 transition-colors text-left">
          {label}
          {!open && (
            <span className="ml-2 text-neutral-400 font-normal normal-case tracking-normal">
              ({count})
            </span>
          )}
        </div>
        <span
          aria-hidden
          className={`text-neutral-400 text-[12px] transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
      </button>

      {open && <div className="pt-1">{children}</div>}
    </section>
  )
}
