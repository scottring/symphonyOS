import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, Inbox, Plus, Search, UserRound } from 'lucide-react'
import { usePlanDestination, planPeriodForPath } from './PlanNavigation'
import { requestPlanFromPaper } from '@/lib/planFromPaperSignal'
import { appRegistry } from '@/shell/appRegistry'

export const DesktopControlsContext = createContext<HTMLElement | null>(null)
export function DesktopPageControls({ children }: { children: ReactNode }) {
  const host = useContext(DesktopControlsContext)
  return host ? createPortal(children, host) : <>{children}</>
}

export function DesktopNavigation({ inboxCount, discussionsUnread, onSearch, onQuickAdd, onSignOut, userName, controlsRef, auxiliaryControls }: {
  inboxCount: number; discussionsUnread: number; onSearch: () => void; onSignOut: () => void
  /** Opens the ⌘K unibox ready to add — the visible twin of the shortcut. Falls back to onSearch. */
  onQuickAdd?: () => void
  auxiliaryControls?: ReactNode; userName?: string; paused: boolean; controlsRef: (node: HTMLDivElement | null) => void
}) {
  const planDestination = usePlanDestination()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { setOpen(null) }, [pathname])
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  function menu(id: string, label: ReactNode, content: ReactNode, active = false) {
    return <div className="page-navigation-menu">
      <button type="button" aria-expanded={open === id} aria-controls={`navigation-${id}`} className={active ? 'is-current' : ''}
        onClick={e => { trigger.current = e.currentTarget; setOpen(open === id ? null : id) }}>{label}<ChevronDown size={12} aria-hidden="true" /></button>
      {open === id && <div id={`navigation-${id}`} className="page-navigation-popover">{content}</div>}
    </div>
  }
  const go = (path: string) => { setOpen(null); navigate(path) }
  // Short labelled columns rather than one tall list. Registry apps join Reference.
  const groups: [string, [string, string][]][] = [
    ['Organize', [['Someday', '/someday'], ['Routines', '/routines']]],
    ['Home', [['Meals', '/meals/plan'], ['Meal shelf', '/meals/shelf'], ['Lists', '/lists'], ['House', '/home']]],
    ['Reference', [['Discussions', '/discussions'], ['Contacts', '/contacts'], ['Documents', '/documents'],
      ['Notes', '/notes'], ['History', '/history'],
      ...appRegistry.filter(a => a.sidebar).sort((a, b) => a.sidebar!.order - b.sidebar!.order)
        .map((a): [string, string] => [a.sidebar!.label, a.route])]],
  ]
  const destinations = groups.flatMap(([, items]) => items)
  return <nav ref={root} className="page-navigation" aria-label="Main navigation">
    <NavLink to="/today" className={pathname === '/' || pathname === '/today' || pathname.startsWith('/tasks-new') ? 'is-current' : ''}>Today</NavLink>
    <NavLink to={planDestination} aria-current={planPeriodForPath(pathname) ? 'page' : undefined} className={planPeriodForPath(pathname) ? 'is-current' : ''}>Plan</NavLink>
    <NavLink to="/inbox" aria-label={`Inbox${inboxCount ? `, ${inboxCount} items` : ''}`}><Inbox size={16} aria-hidden="true" /><span>Inbox</span>{inboxCount > 0 && <span className="navigation-count">{inboxCount}</span>}</NavLink>
    {menu('more', <>More{discussionsUnread > 0 && <span className="navigation-count">{discussionsUnread}</span>}</>, <div className="page-navigation-more">
      <div className="page-navigation-groups">
        {groups.map(([group, items]) => <div key={group} role="group" aria-labelledby={`navigation-group-${group}`} className="page-navigation-group">
          <h3 id={`navigation-group-${group}`}>{group}</h3>
          {items.map(([label, route]) => <button key={route} onClick={() => go(route)}
            aria-label={label === 'Discussions' && discussionsUnread > 0 ? `Discussions, ${discussionsUnread} unread` : undefined}>
            {label}{label === 'Discussions' && discussionsUnread > 0 && <span className="navigation-count">{discussionsUnread}</span>}
          </button>)}
        </div>)}
      </div>
      <div className="page-navigation-more-action">
        <button onClick={() => { setOpen(null); if (!requestPlanFromPaper()) navigate('/today') }}>Plan from paper</button>
        <span>Photograph a paper page into your plan</span>
      </div>
    </div>, destinations.some(([, route]) => pathname.startsWith(route)))}
    <div className="page-navigation-utilities">
      {auxiliaryControls}
      <div ref={controlsRef} className="page-navigation-page-controls" />
      {/* The visible twin of ⌘K: capture from any page without knowing the shortcut. */}
      <button type="button" onClick={onQuickAdd ?? onSearch} aria-label="Add — ⌘K" title="Add a task, note or event (⌘K)"
        className="page-navigation-add"><Plus size={15} aria-hidden="true" /><span>Add</span><kbd>⌘K</kbd></button>
      <button onClick={onSearch} aria-label="Search"><Search size={16} /></button>
      {menu('account', <><UserRound size={16} /><span className="sr-only">Account</span></>, <>
        {userName && <p>{userName}</p>}<button onClick={() => go('/settings')}>Settings</button><button onClick={() => { setOpen(null); onSignOut() }}>Sign out</button>
      </>)}
    </div>
  </nav>
}
