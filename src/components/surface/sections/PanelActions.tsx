import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export interface PanelAction {
  id: string
  label: string
  icon?: ConceptName
  /**
   * primary   — the filled Complete button, the one the panel leads with
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
  /**
   * The more-menu, given the actions past the cap so ONE ⋯ holds both. When
   * set it replaces `overflow` and the built-in fold menu.
   */
  renderOverflow?: (folded: PanelAction[]) => ReactNode
}

const BASE =
  'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-2.5 text-[14px] font-medium transition-colors sm:px-3'
export const ACTION_CHIP = `${BASE} border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50`
const PRIMARY_CHIP = `${BASE} border-primary-600 bg-primary-600 text-white hover:bg-primary-700`
const COMPLETED_CHIP = `${BASE} border-neutral-200 bg-neutral-100 text-neutral-500 hover:bg-neutral-200`
const FLAGGED_CHIP = `${BASE} border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200`

/**
 * Actions past this point fold into the overflow menu rather than wrapping onto
 * a second row: one filled primary and two more, then the ⋯ (detail pane
 * standard, 2026-10-19). At five the row still broke onto three lines in a
 * 420px column — "Talk to Iris about this" alone is a third of it.
 */
export const MAX_VISIBLE_ACTIONS = 3
/** A phone's touch-size buttons fit one fewer before the ⋯. */
export const MAX_VISIBLE_ACTIONS_NARROW = 2

/**
 * Splits the row at the cap. An action that renders its own popover (a
 * scheduler, a duration menu) cannot become a menu line, so it never folds.
 */
export function splitActions(actions: PanelAction[], cap = MAX_VISIBLE_ACTIONS): { visible: PanelAction[]; folded: PanelAction[] } {
  const visible: PanelAction[] = []
  const folded: PanelAction[] = []
  for (const a of actions) {
    if (a.render || visible.length < cap) visible.push(a)
    else folded.push(a)
  }
  return { visible, folded }
}

/** A folded action as a menu line: a link action follows its href. */
export function foldedClick(a: PanelAction): (() => void) | undefined {
  if (a.onClick) return a.onClick
  if (a.href) {
    const href = a.href
    return () => { window.location.assign(href) }
  }
  return undefined
}

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
      <a href={action.href} title={action.title} className={chipClass(action.kind)}>
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
export function PanelActions({ actions, overflow, renderOverflow }: PanelActionsProps) {
  const narrow = useMediaQuery('(max-width: 639px)')
  const { visible, folded } = splitActions(actions, narrow ? MAX_VISIBLE_ACTIONS_NARROW : MAX_VISIBLE_ACTIONS)
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
    // Tighter on a phone, where the touch-size buttons would otherwise push
    // the ⋯ onto a line of its own.
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {visible.map((a) => (
        <Chip key={a.id} action={a} />
      ))}

      {folded.length > 0 && !renderOverflow && (
        <div className="relative" ref={ref}>
          <button
            type="button"
            aria-label="More actions"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`${ACTION_CHIP} w-9 justify-center px-0`}
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
                    foldedClick(a)?.()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-[15px] text-neutral-700 hover:bg-neutral-50"
                >
                  {a.icon && <ConceptIcon name={a.icon} decorative />}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {renderOverflow ? renderOverflow(folded) : overflow}
    </div>
  )
}
