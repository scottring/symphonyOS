import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'

export interface PanelAction {
  id: string
  label: string
  icon?: ConceptName
  /**
   * primary   — the outlined Complete pill
   * completed — the greyed, checked "already done" state (click to reopen)
   * flagged   — the amber "To discuss" state
   */
  kind?: 'primary' | 'completed' | 'flagged' | 'default'
  href?: string
  onClick?: () => void
  /**
   * For toggles (Discuss, pin). Renders aria-pressed so the chip announces its
   * state rather than just changing color.
   */
  pressed?: boolean
  /** A small dot after the label — "something here is waiting for you". */
  dot?: boolean
  /** Hover/long-press explanation. */
  title?: string
  /** Owns its own popover (schedule, duration). Rendered verbatim. */
  render?: () => ReactNode
}

export interface PanelActionsProps {
  actions: PanelAction[]
  /** The panel's more-menu. Always rendered last, never counted against the cap. */
  overflow?: ReactNode
}

const BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'
export const ACTION_CHIP = `${BASE} bg-neutral-100 text-neutral-700 hover:bg-neutral-200`
const PRIMARY_CHIP = `${BASE} border border-primary-600 text-primary-700 hover:bg-primary-50`
const COMPLETED_CHIP = `${BASE} border border-neutral-200 bg-neutral-100 text-neutral-400 hover:bg-neutral-200`
const FLAGGED_CHIP = `${BASE} bg-amber-100 text-amber-800 hover:bg-amber-200`

/**
 * Actions past this point fold into the overflow menu rather than wrapping onto
 * a second row. Six chips breaking mid-row is a large part of what made the
 * panel read as a scatter of unrelated buttons.
 */
export const MAX_VISIBLE_ACTIONS = 5

function chipClass(kind: PanelAction['kind']): string {
  if (kind === 'primary') return PRIMARY_CHIP
  if (kind === 'completed') return COMPLETED_CHIP
  if (kind === 'flagged') return FLAGGED_CHIP
  return ACTION_CHIP
}

function Chip({ action }: { action: PanelAction }) {
  if (action.render) return <>{action.render()}</>

  const body = (
    <>
      {action.kind === 'completed' && <Check className="w-4 h-4" aria-hidden />}
      {action.icon && <ConceptIcon name={action.icon} decorative />}
      {action.label}
      {action.dot && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-label="Unread" />}
    </>
  )

  if (action.href) {
    return (
      <a href={action.href} className={chipClass(action.kind)}>
        {body}
      </a>
    )
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      aria-pressed={action.pressed}
      title={action.title}
      className={chipClass(action.kind)}
    >
      {body}
    </button>
  )
}

/**
 * The panel's action row, rendered from descriptors.
 *
 * Every panel used to build its own: the task panel a flat flex-wrap driven by
 * a dozen props, the event panel a hand-assembled block with its own copies of
 * the chip classes. Same buttons, two spellings, and no shared idea of ordering
 * or of when to stop. Panels now say what the actions ARE; this decides how they
 * look and where they stop.
 */
export function PanelActions({ actions, overflow }: PanelActionsProps) {
  const visible = actions.slice(0, MAX_VISIBLE_ACTIONS)
  const folded = actions.slice(MAX_VISIBLE_ACTIONS)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((a) => (
        <Chip key={a.id} action={a} />
      ))}

      {folded.length > 0 && (
        <div className="relative" ref={ref}>
          <button
            type="button"
            aria-label="More actions"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={ACTION_CHIP}
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden />
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 z-20 min-w-[10rem] rounded-xl border border-neutral-100 bg-white py-1 shadow-lg">
              {folded.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    a.onClick?.()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {a.icon && <ConceptIcon name={a.icon} decorative />}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {overflow}
    </div>
  )
}
