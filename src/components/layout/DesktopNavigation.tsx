import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, Inbox, Menu, Search, UserRound } from 'lucide-react'
import { requestPlanFromPaper } from '@/lib/planFromPaperSignal'
import { appRegistry } from '@/shell/appRegistry'
import { MORE_GROUPS, isDestinationActive } from './moreDestinations'

export const DesktopControlsContext = createContext<HTMLElement | null>(null)
export function DesktopPageControls({ children }: { children: ReactNode }) {
  const host = useContext(DesktopControlsContext)
  return host ? createPortal(children, host) : <>{children}</>
}
/** The slot right of the ☰: a page's one quiet reading (Today's weather). */
export const DesktopLeadContext = createContext<HTMLElement | null>(null)

export function DesktopNavigation({ inboxCount, discussionsUnread, onSearch, onSignOut, userName, controlsRef, leadRef, auxiliaryControls }: {
  inboxCount: number; discussionsUnread: number; onSearch: () => void; onSignOut: () => void
  auxiliaryControls?: ReactNode; userName?: string; paused: boolean; controlsRef: (node: HTMLDivElement | null) => void
  leadRef?: (node: HTMLDivElement | null) => void
}) {
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
  function menu(id: string, label: ReactNode, content: ReactNode, active = false, opts: { ariaLabel?: string; chevron?: boolean; className?: string } = {}) {
    return <div className={`page-navigation-menu${opts.className ? ` ${opts.className}` : ''}`}>
      <button type="button" aria-expanded={open === id} aria-controls={`navigation-${id}`} className={active ? 'is-current' : ''} aria-label={opts.ariaLabel} title={opts.ariaLabel}
        onClick={e => { trigger.current = e.currentTarget; setOpen(open === id ? null : id) }}>{label}{opts.chevron !== false && <ChevronDown size={12} aria-hidden="true" />}</button>
      {open === id && <div id={`navigation-${id}`} className="page-navigation-popover">{content}</div>}
    </div>
  }
  const go = (path: string) => { setOpen(null); navigate(path) }
  // Short labelled columns rather than one tall list. Registry apps join Reference.
  const groups: [string, [string, string][]][] = MORE_GROUPS.map(([group, items]): [string, [string, string][]] => [group, [
    ...items.map(({ label, route }): [string, string] => [label, route]),
    ...(group === 'Reference' ? appRegistry.filter(a => a.sidebar).sort((a, b) => a.sidebar!.order - b.sidebar!.order)
      .map((a): [string, string] => [a.sidebar!.label, a.route]) : []),
  ]])
  const destinations = groups.flatMap(([, items]) => items)
  return <nav ref={root} className="page-navigation" aria-label="Main navigation">
    {/* No "Planner" and no "Routines" here (Scott, 2026-09-28): the horizon
        rail beneath is the main navigation, and Routines lives under More.
        One bar on every page (2026-09-29): the menu at the left; at the right
        Inbox, search and you — page controls live in the page heading. No Add
        button (Scott, 2026-09-29): the round + and ⌘K already add. */}
    {menu('more', <><Menu size={18} aria-hidden="true" />{discussionsUnread > 0 && <span className="navigation-count">{discussionsUnread}</span>}</>, <div className="page-navigation-more">
      <div className="page-navigation-groups">
        {groups.map(([group, items]) => <div key={group} role="group" aria-labelledby={`navigation-group-${group}`} className="page-navigation-group">
          <h3 id={`navigation-group-${group}`}>{group}</h3>
          {items.map(([label, route]) => <button key={route} onClick={() => go(route)} aria-current={isDestinationActive(route, pathname) ? 'page' : undefined}
            aria-label={label === 'Discussions' && discussionsUnread > 0 ? `Discussions, ${discussionsUnread} unread` : undefined}>
            {label}{label === 'Discussions' && discussionsUnread > 0 && <span className="navigation-count">{discussionsUnread}</span>}
          </button>)}
        </div>)}
      </div>
      <div className="page-navigation-more-action">
        <button onClick={() => { setOpen(null); if (!requestPlanFromPaper()) navigate('/today') }}>Plan from paper</button>
        <span>Photograph a paper page into your plan</span>
      </div>
    </div>, destinations.some(([, route]) => isDestinationActive(route, pathname)),
      { ariaLabel: discussionsUnread > 0 ? `More, ${discussionsUnread} unread discussions` : 'More', chevron: false, className: 'is-hamburger' })}
    {leadRef && <div ref={leadRef} className="page-navigation-lead" />}
    <div className="page-navigation-utilities">
      {auxiliaryControls}
      <div ref={controlsRef} className="page-navigation-page-controls" />
      <NavLink to="/inbox" className="page-navigation-icon" title="Inbox"
        aria-label={`Inbox${inboxCount ? `, ${inboxCount} ${inboxCount === 1 ? 'item' : 'items'}` : ''}`}>
        <Inbox size={17} aria-hidden="true" />{inboxCount > 0 && <span className="navigation-count">{inboxCount}</span>}
      </NavLink>
      <button onClick={onSearch} aria-label="Search" title="Search" className="page-navigation-icon"><Search size={17} aria-hidden="true" /></button>
      {menu('account', <><UserRound size={17} aria-hidden="true" /><span className="sr-only">Account</span></>, <>
        {userName && <p>{userName}</p>}<button onClick={() => go('/settings')}>Settings</button><button onClick={() => { setOpen(null); onSignOut() }}>Sign out</button>
      </>, false, { chevron: false, className: 'is-account' })}
    </div>
  </nav>
}
