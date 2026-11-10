// Where a week sheet row's task stands (Scott, 2026-11-10, mockup
// HSbVH3EkbCgdmBMG4zeQgk): its own Status button on the row, apart from the
// faces, which only say who is doing it. One choice — Not started, Started or
// Waiting — and under it only what goes with that choice: a started task's
// steps, a wait's who and check-back day. Someone waiting on us is a separate,
// rarer question, asked at the bottom.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SheetStatus, SheetStatusChange } from '@/lib/planning/sheetStatus'
import { CHECK_BACK_CHOICES } from '@/lib/today/waiting'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'

/** The household's names (and whoever is already named), then anyone else typed in. */
function WhoPicker({ people, picked, inputLabel, onPick }: {
  people: readonly string[]; picked?: string | null; inputLabel: string; onPick: (name: string) => void
}) {
  const [text, setText] = useState('')
  const names = picked && !people.includes(picked) ? [picked, ...people] : people
  return (
    <div className="sheet-status-chips">
      {names.map((name) => (
        <button key={name} type="button" className="sheet-status-chip" aria-pressed={picked === name} onClick={() => onPick(name)}>{name}</button>
      ))}
      <input className="sheet-status-input sheet-status-other" aria-label={inputLabel} placeholder="Someone else…" value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !text.trim()) return
          e.preventDefault(); onPick(text.trim()); setText('')
        }} />
    </div>
  )
}

const STATES: { id: SheetStatus | 'none'; label: string }[] = [
  { id: 'none', label: 'Not started' },
  { id: 'started', label: 'Started' },
  { id: 'waiting', label: 'Waiting' },
]

export function SheetStatusMenu({ status, waitingFor, owedTo, onOwed, people, onChange, steps, onAddStep, onDoneStep }: {
  status?: SheetStatus
  waitingFor?: string
  /** Someone outside waits on us for it (the wall's "Waiting on us"). */
  owedTo?: string | null
  /** Undefined: the menu does not ask who is waiting on you. */
  onOwed?: (who: string | null) => void
  /** The household's first names, offered first for a wait. */
  people: readonly string[]
  onChange: (change: SheetStatusChange) => void
  /** A task in progress: its open steps, the next first. Undefined: no steps here. */
  steps?: readonly { id: string; title: string }[]
  onAddStep?: (title: string) => void
  onDoneStep?: (id: string) => void
}) {
  // Waiting picked but no one named yet: nothing is written until a name is.
  const [choosingWait, setChoosingWait] = useState(false)
  const [askingOwed, setAskingOwed] = useState(false)
  const [stepText, setStepText] = useState('')
  const shown: SheetStatus | 'none' = choosingWait ? 'waiting' : status ?? 'none'
  const pick = (id: SheetStatus | 'none') => {
    if (id === 'waiting') { if (status !== 'waiting') setChoosingWait(true); return }
    setChoosingWait(false)
    if (id !== (status ?? 'none')) onChange({ to: id })
  }
  return (
    <div className="sheet-status">
      <div className="sheet-status-section">
        <span className="sheet-status-h" id="sheet-status-stands">Where it stands</span>
        <div role="radiogroup" aria-labelledby="sheet-status-stands" className="sheet-status-seg">
          {STATES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={shown === s.id} className="sheet-status-seg-btn" onClick={() => pick(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      {shown === 'started' && steps && (
        <div className="sheet-status-section">
          <span className="sheet-status-h">Steps <span className="sheet-status-h-note">· optional, the first shows on the row</span></span>
          {steps.length > 0 && (
            <ul className="sheet-steps-list" aria-label="Steps">
              {steps.map((step) => (
                <li key={step.id}>
                  <button type="button" className="sheet-step-check" aria-label={`Mark ${step.title} done`} onClick={() => onDoneStep?.(step.id)} />
                  <span>{step.title}</span>
                </li>
              ))}
            </ul>
          )}
          <input className="sheet-status-input" aria-label="Add a step" placeholder="+ Add a step, then Enter" value={stepText}
            onChange={(e) => setStepText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !stepText.trim()) return
              e.preventDefault(); onAddStep?.(stepText); setStepText('')
            }} />
        </div>
      )}

      {shown === 'waiting' && (
        <>
          <div className="sheet-status-section">
            <span className="sheet-status-h">Waiting on</span>
            <WhoPicker people={people} picked={status === 'waiting' ? waitingFor : undefined} inputLabel="Waiting on someone else"
              onPick={(name) => { setChoosingWait(false); onChange({ to: 'waiting', on: name }) }} />
          </div>
          {status === 'waiting' && waitingFor && (
            <div className="sheet-status-section">
              <span className="sheet-status-h">Check back</span>
              <div className="sheet-status-chips">
                {CHECK_BACK_CHOICES.map((c) => (
                  <button key={c.key} type="button" className="sheet-status-chip" title="Moves it to that day; it comes back then"
                    onClick={() => onChange({ to: 'waiting', on: waitingFor, checkBack: c.date() })}>{c.label}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {onOwed && (
        <div className="sheet-status-section sheet-status-owed">
          {askingOwed || owedTo ? (
            <>
              <span className="sheet-status-h">Someone’s waiting on you</span>
              <WhoPicker people={people} picked={owedTo} inputLabel="Someone else waiting on you"
                onPick={(name) => { setAskingOwed(false); onOwed(owedTo === name ? null : name) }} />
            </>
          ) : (
            <button type="button" className="sheet-status-link" onClick={() => setAskingOwed(true)}>Is someone waiting on you for this?</button>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_MENU_WIDTH = 320

/** The row's Status button and its menu, portalled to <body> beside it.
 *  Controlled, so the row's own status line can open it too. */
export function SheetStatusButton({ open, onOpenChange, title, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The task's title, for the button's and the menu's names. */
  title: string
  children: ReactNode
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)
  usePopoverFocus(open, triggerRef, menuRef, () => onOpenChange(false))

  useEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return }
    const r = triggerRef.current.getBoundingClientRect()
    const height = 360
    const above = window.innerHeight - r.bottom < height && r.top > height
    const left = Math.max(8, Math.min(r.right - STATUS_MENU_WIDTH, window.innerWidth - STATUS_MENU_WIDTH - 8))
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above })
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      // The row's status line opens this too; let its own click decide.
      if ((t as Element).closest?.('[data-sheet-status-opener]')) return
      onOpenChange(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('touchstart', outside) }
  }, [open, onOpenChange])

  return (
    <>
      <button ref={triggerRef} type="button" className="above-sheet-status-btn" aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Where ${title} stands`} title="Where it stands" onClick={() => onOpenChange(!open)}>
        {/* The row's own circle, half full, and a caret: "set how far along
            this is" (Scott, 2026-11-10: no word, and nothing at rest). */}
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="10" cy="10" r="7" /><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 20 20" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} role="dialog" aria-label={`Where ${title} stands`} className="sheet-status-pop"
          style={{ top: pos.top, left: pos.left, width: STATUS_MENU_WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined }}
          onClick={(e) => e.stopPropagation()}>
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
