import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConceptIcon } from '@/lib/conceptIcons'

interface Props {
  open: boolean
  onClose: () => void
  /** Anchor ref so click-outside can ignore the trigger button. */
  anchorRef?: React.RefObject<HTMLElement | null>
}

/** Floating right-anchored help panel triggered by the ? button in the
 *  topbar. Closes on Esc or click-outside. See spec §C. */
export function HelpPanel({ open, onClose, anchorRef }: Props) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc + click-outside close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (panelRef.current?.contains(t)) return
      if (anchorRef?.current && anchorRef.current.contains(t)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const goto = (path: string) => {
    onClose()
    navigate(path)
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Help and tour"
      className="fixed top-[72px] right-6 w-[360px] z-50 bg-bg-elevated border border-neutral-200 rounded-[14px] overflow-hidden animate-fade-in-scale"
      style={{ boxShadow: '0 20px 50px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)' }}
    >
      <div className="px-4 py-3.5 border-b border-neutral-100 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
          HELP & TOUR
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[16px] text-neutral-400 hover:text-neutral-700 leading-none px-1"
          aria-label="Close help"
        >×</button>
      </div>

      <div className="p-[18px]">
        <div className="font-display italic text-[18px] text-neutral-800 mb-1">
          What is this page for?
        </div>
        <p className="text-[13px] text-neutral-500 mb-[18px] leading-[1.55]">
          The plan is one ritual: brief → habits → week → batch → groceries. Top to bottom, scroll to the next thing.
        </p>

        <HelpRow
          icon="◐"
          title="Quick tour"
          sub="3 minutes · take a guided walk through the planner"
          onClick={() => {
            // Tour mode is out of scope for v1 — surface a friendly stub.
            onClose()
            window.alert('Quick tour is coming soon. For now, the help panel and sample plan cover most needs.')
          }}
        />
        <HelpRow
          icon="◍"
          title="See a sample plan"
          sub="A complete example using the Whitman family"
          onClick={() => goto('/onboarding/sample')}
        />
        <HelpRow
          icon={<ConceptIcon name="ai" size={14} decorative />}
          title="Re-run setup"
          sub="Edit household, goals, or rhythms"
          onClick={() => goto('/onboarding')}
        />

        <div className="mt-4 p-3 bg-bg-base rounded-lg text-[11.5px] text-neutral-400 leading-[1.55]">
          Stuck? Type <strong className="font-medium text-neutral-600">⌘K</strong> anywhere to ask Symphony — it knows your plan and can change it.
        </div>
      </div>
    </div>
  )
}

function HelpRow({
  icon, title, sub, onClick,
}: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left grid gap-3 py-2.5 border-b border-neutral-100 last:border-b-0 hover:bg-bg-base transition-colors -mx-2 px-2 rounded"
      style={{ gridTemplateColumns: '32px 1fr' }}
    >
      <div className="w-7 h-7 rounded-lg bg-primary-50 text-primary-500 grid place-items-center font-display text-[16px]">
        {icon}
      </div>
      <div>
        <div className="font-display text-[17px] text-neutral-800 leading-[1.2]">{title}</div>
        <div className="text-[12px] text-neutral-500 mt-0.5">{sub}</div>
      </div>
    </button>
  )
}
