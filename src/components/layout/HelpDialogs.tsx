import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DOMAINS } from '@/lib/domains'
import { domainHotkeyLabel } from '@/lib/domainHotkey'

const SHORTCUTS: [keys: string, action: string][] = [
  ['⌘K', 'Add, search, or ask Symphony'],
  ['⌘/', 'Also opens add and search'],
  ...DOMAINS.map((d, i): [string, string] => [domainHotkeyLabel(i), `While adding: file under ${d.label}`]),
  ['Enter', 'While adding: add what you typed'],
  ['⇧Enter', 'While adding: add the raw text to Inbox'],
  ['⌘Enter', 'While adding: ask Symphony instead'],
  ['Esc', 'Close a menu or dialog'],
]

function MenuDialog({ title, onClose, returnFocus, children }: { title: string; onClose: () => void; returnFocus?: HTMLElement | null; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  // Held in a ref: the menu passes a fresh onClose each render, and re-running
  // this effect on every parent render yanked focus back to the dialog frame.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  // Opened from a menu whose item has gone: focus returns to the menu's button.
  const returnFocusRef = useRef(returnFocus)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCloseRef.current() } }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); (returnFocusRef.current ?? previous)?.focus() }
  }, [])
  return createPortal(
    <div className="desktop-footer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="desktop-footer-dialog-title" className="desktop-footer-dialog">
        <div className="flex items-center justify-between gap-4">
          <h2 id="desktop-footer-dialog-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>, document.body)
}

/** Keyboard shortcuts and Help, opened from the ☰ menu (Scott, 2026-10-02:
 *  the footer bar that carried them is gone, leaving the scenery clear). */
export function HelpDialogs({ open, onClose, returnFocus }: {
  open: 'shortcuts' | 'help' | null; onClose: () => void; returnFocus?: HTMLElement | null
}) {
  const navigate = useNavigate()
  if (open === 'shortcuts') return (
    <MenuDialog title="Keyboard shortcuts" onClose={onClose} returnFocus={returnFocus}>
      <dl className="desktop-footer-shortcuts">
        {SHORTCUTS.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}
      </dl>
      <p>On Windows and Linux, use Ctrl in place of ⌘.</p>
    </MenuDialog>
  )
  if (open === 'help') return (
    <MenuDialog title="Help" onClose={onClose} returnFocus={returnFocus}>
      <p className="desktop-footer-guide">
        <strong>New here, or want a hand?</strong>{' '}
        <button type="button" className="pv2-link" onClick={() => { onClose(); navigate('/start') }}>Plan with guidance</button>
        {' '}walks you through the year, a month, a week or just today — on the real pages, and you can stop any time.
      </p>
      <ul className="desktop-footer-help">
        <li><strong>Today</strong> holds what you have chosen to do today, with what you need to do it.</li>
        <li><strong>Week and Month</strong> open their pages, or pin their lists beside the page you are on.</li>
        <li><strong>Inbox</strong> keeps captures until you decide where they belong.</li>
        <li><strong>⌘K</strong> adds, searches, or asks Symphony from anywhere.</li>
      </ul>
      <p>
        Questions or problems: <a href="mailto:hello@symphony-os.com">hello@symphony-os.com</a>.
        {' '}How your data is used: <a href="https://www.symphony-os.com/privacy" target="_blank" rel="noreferrer">privacy page</a>.
      </p>
    </MenuDialog>
  )
  return null
}
