import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePanelCollapse } from '../hooks/usePanelCollapse'

export interface PanelSectionProps {
  /** Stable section TYPE id — collapse is remembered against this, not the entity. */
  id: string
  label: string
  /**
   * One line standing in for the body while collapsed. A section with content
   * must always say so: collapsing is "get this out of my way", never "hide the
   * fact that this exists".
   */
  preview?: string
  /**
   * Trailing controls (e.g. Notes' widen button). Never toggles the section.
   * Pass a function to vary them by state — controls that only make sense on an
   * open section shouldn't sit on a collapsed one.
   */
  actions?: ReactNode | ((collapsed: boolean) => ReactNode)
  children: ReactNode
}

/**
 * The one titled block in the detail panel.
 *
 * Before this, every section hand-rolled its own label div — fifteen copies that
 * had already drifted (mb-1 vs mb-2, one at text-[11px], some with trailing
 * actions and some without), and not one of which could be collapsed. Opening
 * Notes meant living with Notes.
 */
export function PanelSection({ id, label, preview, actions, children }: PanelSectionProps) {
  const [collapsed, toggle] = usePanelCollapse(id)
  const Chevron = collapsed ? ChevronRight : ChevronDown
  const trailing = typeof actions === 'function' ? actions(collapsed) : actions

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left group"
        >
          <span className="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-neutral-400 group-hover:text-neutral-600 transition-colors">
            {label}
          </span>
          {collapsed && preview && (
            <span
              data-panel-preview
              className="min-w-0 flex-1 truncate text-[13px] text-neutral-400"
            >
              {preview}
            </span>
          )}
          <Chevron
            className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-300 group-hover:text-neutral-500 transition-colors"
            aria-hidden
          />
        </button>
        {trailing && <div className="flex shrink-0 items-center gap-3">{trailing}</div>}
      </div>
      {!collapsed && children}
    </section>
  )
}
