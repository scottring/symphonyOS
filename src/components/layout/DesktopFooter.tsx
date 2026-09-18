import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { DOMAINS } from '@/lib/domains'
import { domainHotkeyLabel } from '@/lib/domainHotkey'

/** Host for the page's own footer action (Today's "Review today"). Desktop shell only. */
export const DesktopFooterActionContext = createContext<HTMLElement | null>(null)
export function DesktopFooterAction({ children }: { children: ReactNode }) {
  const host = useContext(DesktopFooterActionContext)
  return host ? createPortal(children, host) : null
}

const SHORTCUTS: [keys: string, action: string][] = [
  ['⌘K', 'Add, search, or ask Symphony'],
  ['⌘/', 'Also opens add and search'],
  ...DOMAINS.map((d, i): [string, string] => [domainHotkeyLabel(i), `While adding: file under ${d.label}`]),
  ['Enter', 'While adding: add what you typed'],
  ['⇧Enter', 'While adding: add the raw text to Inbox'],
  ['⌘Enter', 'While adding: ask Symphony instead'],
  ['Esc', 'Close a menu or dialog'],
]

function FooterDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [onClose])
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

export function DesktopFooter({ actionRef }: { actionRef: (node: HTMLDivElement | null) => void }) {
  const [open, setOpen] = useState<'shortcuts' | 'help' | null>(null)
  const close = () => setOpen(null)
  return <footer className="desktop-footer">
    <div className="desktop-footer-rule">
      <div ref={actionRef} className="desktop-footer-action" />
      {/* The one place the brand appears in the app: a quiet signature. */}
      <div className="desktop-footer-signature">
        <span className="desktop-footer-logo"><img src="/symphony-logo.jpg" alt="" /></span>
        <span>Symphony</span>
      </div>
      <div className="desktop-footer-links">
        <button type="button" onClick={() => setOpen('shortcuts')}>Keyboard shortcuts</button>
        <button type="button" onClick={() => setOpen('help')}>Help</button>
      </div>
    </div>
    {open === 'shortcuts' && <FooterDialog title="Keyboard shortcuts" onClose={close}>
      <dl className="desktop-footer-shortcuts">
        {SHORTCUTS.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}
      </dl>
      <p>On Windows and Linux, use Ctrl in place of ⌘.</p>
    </FooterDialog>}
    {open === 'help' && <FooterDialog title="Help" onClose={close}>
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
    </FooterDialog>}
  </footer>
}
