import { useEffect, createElement } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { requestPlanFromPaper } from '@/lib/planFromPaperSignal'
import { appRegistry } from '@/shell/appRegistry'
import { SidebarGroup } from './SidebarGroup'
import { useSidebarGroupState } from '@/hooks/useSidebarGroupState'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useLists } from '@/hooks/useLists'
import { ConceptIcon } from '@/lib/conceptIcons'
import {
  Sun,
  CalendarRange,
  CalendarDays,
  Leaf,
  MessageCircle,
  UtensilsCrossed,
  Home,
  Inbox,
  Users2,
  List,
  FileText,
  NotebookPen,
  Printer,
  Repeat,
  Target,
  History,
  Settings,
  LogOut,
} from 'lucide-react'

// Feature flags for in-progress features
const FEATURES = {
  lists: true,
}

export type ViewType = 'agent' | 'home' | 'home-app' | 'today' | 'inbox' | 'goals' | 'projects' | 'routines' | 'lists' | 'contacts' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'meals' | 'weekly-planning' | 'family-member' | 'discussions'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  userEmail?: string
  userName?: string
  onSignOut?: () => void
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onOpenSearch?: () => void
  inboxCount?: number
  /** Discussions waiting on the viewer — unread threads, never a count of work. */
  discussionsUnread?: number
}

// Derive a friendly first name for the greeting. A stored display name with a
// space is a real human name → use its first token. Otherwise the stored name
// may be a username (e.g. "smkaufman"), so fall back to the email local-part:
// scott.kaufman → Scott.
function deriveFirstName(name?: string, email?: string): string {
  const trimmed = (name || '').trim()
  const pick = trimmed.includes(' ')
    ? trimmed.split(/\s+/)[0]
    : (email || trimmed).split('@')[0].split(/[._-]/)[0]
  if (!pick) return 'there'
  return pick.charAt(0).toUpperCase() + pick.slice(1)
}

export function Sidebar({
  collapsed,
  onToggle,
  userEmail,
  userName,
  onSignOut,
  activeView,
  onViewChange,
  onOpenSearch,
  inboxCount,
  discussionsUnread,
}: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const { state: groupState, toggle: toggleGroup, setOpen: openGroup } = useSidebarGroupState()

  // The rhythm spine (Phase 2b): Inbox · the horizon rungs · Routines · Library.
  // The Library group (Goals, Meals, Contacts, Lists, House, History,
  // + registry apps) auto-expands when any of its destinations is the active
  // route. Group→state-key: LIBRARY→'library'.
  //
  // Routines is deliberately absent from this list now that it sits outside the
  // group: leaving it in would throw Library open every time you visited a page
  // that is no longer in it.
  const libraryActive =
    activeView === 'goals' || activeView === 'meals' ||
    activeView === 'home-app' || activeView === 'lists' ||
    activeView === 'contacts' || activeView === 'contact-detail' ||
    activeView === 'history' || activeView === 'routines' ||
    location.pathname.startsWith('/goals') || location.pathname.startsWith('/meals') ||
    location.pathname.startsWith('/lists') || location.pathname.startsWith('/contacts') ||
    location.pathname.startsWith('/history') || location.pathname.startsWith('/home') ||
    location.pathname.startsWith('/routines') || location.pathname.startsWith('/documents') ||
    location.pathname.startsWith('/notes')

  useEffect(() => {
    if (libraryActive) openGroup('library')
  }, [libraryActive, openGroup])

  // Today is the rich HomeView at `/` or `/today` (plus its cutover aliases).
  function isTodayActive(): boolean {
    const p = location.pathname
    return p === '/' || p === '/today' || p === '/tasks-new' || p === '/tasks-new/today'
  }

  const homeAppActive = activeView === 'home-app'
  const listsActive = activeView === 'lists' || location.pathname.startsWith('/lists')

  const { homes } = useHomes()
  const home = homes[0]
  const { rooms } = useSpaces(homeAppActive ? home?.id : undefined)
  const { lists: allLists } = useLists()

  const inlineRooms = homeAppActive ? rooms.slice(0, 5) : []
  const moreRoomsCount = homeAppActive ? Math.max(0, rooms.length - 5) : 0

  const inlineLists = listsActive
    ? [...allLists].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5)
    : []
  const moreListsCount = listsActive ? Math.max(0, allLists.length - 5) : 0

  const firstName = deriveFirstName(userName, userEmail)

  // Nav item helper
  function navItemClass(active: boolean): string {
    return `symphony-nav-item w-full flex items-center gap-3 px-3 py-2.5 transition-colors duration-200 text-[14px] ${
      active
        ? 'symphony-nav-active text-neutral-950'
        : 'text-neutral-600 hover:bg-neutral-200/40 hover:text-neutral-950'
    } ${collapsed ? 'justify-center' : ''}`
  }

  return (
    <aside
      className={`
        symphony-sidebar h-full border-r border-neutral-300/60
        flex flex-col
        transition-all duration-500
        ${collapsed ? 'w-[68px]' : 'w-64'}
      `}
    >
      {/* Header: logo + name */}
      <div className={`pt-6 pb-5 flex items-center justify-between ${collapsed ? 'px-3' : 'px-4'}`}>
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center w-full' : ''}`}>
          <img src="/symphony-logo.jpg" alt={collapsed ? "Symphony" : ""} className="w-10 h-10 rounded-full object-cover shrink-0" />
          {!collapsed && (
            <span className="symphony-wordmark">Symphony</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mt-1 p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 transition-colors"
          aria-label="Expand sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Search row. Chat + Wall icons removed in Phase 1 (sidebar restraint);
          chat has its own surfaces and Wall is a rarely-used cross-tab action. */}
      <div className={`px-3 mt-1 flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className={`
              flex-1 flex items-center gap-2 px-3 py-2 rounded-lg
              text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/70
              transition-all duration-200 text-[13px]
              ${collapsed ? 'justify-center flex-none' : ''}
            `}
            aria-label="Search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="flex-1 text-left">Search</span>}
            {!collapsed && (
              <kbd className="text-[11px] text-neutral-500 font-sans">
                ⌘K
              </kbd>
            )}
          </button>
        )}
      </div>

      {/* Daily tools and planning horizons are separated by space. */}
      <nav aria-label="Main navigation" className="flex-1 min-h-0 px-3 mt-4 space-y-0.5 overflow-y-auto">
        {/* Inbox — where capture lands; the loop starts here. */}
        <button
          onClick={() => onViewChange('inbox')}
          aria-label="Inbox"
          className={`${navItemClass(activeView === 'inbox')} mt-2`}
        >
          {createElement(Inbox, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Inbox</span>
              {typeof inboxCount === 'number' && inboxCount > 0 && (
                <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-md bg-neutral-200/70 text-neutral-600">
                  {inboxCount}
                </span>
              )}
            </>
          )}
        </button>

        <div role="group" aria-label="Planning" className="symphony-nav-section">
        {/* Today — the execution surface. */}
        <button
          onClick={() => onViewChange('today')}
          aria-label="Today"
          className={navItemClass(isTodayActive())}
        >
          <Sun className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Today</span>}
        </button>

        {/* This Week — the provisioning bench (streamlined vision Phase 1):
            where the landed paper plan gets dressed with the context execution
            needs. A surface with its own route, NOT a horizon rung. */}
        <button
          onClick={() => navigate('/week')}
          aria-label="Week"
          className={navItemClass(location.pathname === '/week' || location.pathname.startsWith('/week/'))}
        >
          <CalendarRange className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Week</span>}
        </button>

        {/* The planning ladder above the week — one page per level, the same
            shape on each (its list, the level above in a rail, a look-back at
            the period just ended). Scott, 2026-09-05: "a planning surface for
            the year, then the season with a rail of the year, then the month
            with a rail of the season". */}
        <button
          onClick={() => navigate('/month')}
          aria-label="Month"
          className={navItemClass(location.pathname === '/month')}
        >
          <CalendarDays className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Month</span>}
        </button>
        <button
          onClick={() => navigate('/season')}
          aria-label="Season"
          className={navItemClass(location.pathname === '/season')}
        >
          <Leaf className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Season</span>}
        </button>
        <button
          onClick={() => navigate('/year')}
          aria-label="Year"
          className={navItemClass(location.pathname === '/year')}
        >
          {createElement(Target, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Year</span>}
        </button>

        </div>
        <div role="group" aria-label="Tools" className="symphony-nav-section">
        {/* Plan from paper — the verb that starts the day and the week. From
            any page (Scott, 2026-09-03: it is too important to hide). A Home
            view that is mounted opens the flow in place; otherwise Today
            opens and picks the request up on mount.

            It sits in the nav flush with the places around it — no border, no
            fill. The weight of the label is enough to say it is the one row
            here that does something rather than goes somewhere. */}
        <button
          onClick={() => { if (!requestPlanFromPaper()) onViewChange('today') }}
          title="Plan from paper — photograph your written plan and place its items"
          className={navItemClass(false)}
        >
          <NotebookPen className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Plan from paper</span>}
        </button>

        {/* The paper's companion: four printable sheets, one per horizon. A
            permanent page, never a step — it sits beside Plan from paper
            because that is the pair, pen then camera. */}
        <button
          onClick={() => navigate('/guide')}
          aria-label="Planning guide"
          title="Planning guide — four sheets you can print"
          className={navItemClass(location.pathname === '/guide')}
        >
          <Printer className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Planning guide</span>}
        </button>

        {/* Discussions — the inbox of item conversations. Part of the loop, not
            the Library: a message on a task is addressed to you. */}
        <button
          onClick={() => navigate('/discussions')}
          aria-label="Discussions"
          className={navItemClass(location.pathname.startsWith('/discussions'))}
        >
          <MessageCircle className="w-5 h-5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Discussions</span>
              {typeof discussionsUnread === 'number' && discussionsUnread > 0 && (
                <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-700">
                  {discussionsUnread}
                </span>
              )}
            </>
          )}
        </button>

        </div>

        {/* ── Library ── everything that is reference, not a daily surface.
            Collapsible on purpose: the loop is Inbox → Today → This Week. */}
        <div className="h-3" aria-hidden="true" />
        <SidebarGroup
          label="Library"
          open={groupState.library}
          onToggle={() => toggleGroup('library')}
          forceOpen={libraryActive}
          collapsed={collapsed}
        >
          {/* Routines — demoted from top level (pare-down 2026-09-01): the
              cadence lives in routines-as-data on Today/This Week/the wall;
              this page is where the rules are edited, which is reference. */}
          <button
            onClick={() => navigate('/routines')}
            className={navItemClass(location.pathname.startsWith('/routines'))}
          >
            {createElement(Repeat, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Routines</span>}
          </button>

          {/* Projects is HIDDEN (2026-09-02) — the noun read as GTD jargon and
              confused the household-OS pitch, so it goes the way "Us" and
              "Jobs" went in the 2026-09-01 pare-down: the UI goes, the model
              stays. The projects table, useProjects, types/project.ts and the
              ProjectsList/ProjectView components are all untouched; the three
              seams that hide it are this nav entry, the appRegistry mount and
              the /projects route (redirected in main.tsx). Put all three back
              and the surface returns exactly as it was. */}

          {/* Health (medications + symptoms) is WITHHELD, not deleted — the nav
              entry, the /meds route and the registry entry are the three seams
              that hide it, and putting all three back restores it exactly.
              Everything under src/apps/meds/ and the four hooks it uses are
              untouched. Withheld because only finished work should be reachable:
              deletes on medications/medication_logs/symptoms/symptom_logs are
              silently never delivered by realtime (those tables are published
              but still on default REPLICA IDENTITY, so Postgres can't evaluate
              RLS against the old row). */}

          {/* Meals */}
          <button
            onClick={() => onViewChange('meals')}
            className={navItemClass(activeView === 'meals')}
          >
            {createElement(UtensilsCrossed, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Meals</span>}
          </button>
          {!collapsed && activeView === 'meals' && (
            <button
              onClick={() => navigate('/meals/shelf')}
              className={`w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200 ${location.pathname.startsWith('/meals/shelf') ? 'text-primary-700 bg-primary-50/60 font-medium' : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'}`}
            >
              <span className="text-[14px]">Shelf</span>
            </button>
          )}

          {/* Contacts */}
          <button
            onClick={() => navigate('/contacts')}
            className={navItemClass(location.pathname.startsWith('/contacts'))}
          >
            {createElement(Users2, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Contacts</span>}
          </button>

          {/* Documents */}
          <button
            onClick={() => navigate('/documents')}
            className={navItemClass(location.pathname.startsWith('/documents'))}
          >
            {createElement(FileText, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Documents</span>}
          </button>

          {/* Notes — the stream. Every other notes editor in the app is reached
              through the thing the note hangs off; this is the only way to a
              note you don't already know where to find. */}
          <button
            onClick={() => navigate('/notes')}
            className={navItemClass(location.pathname.startsWith('/notes'))}
          >
            {createElement(NotebookPen, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Notes</span>}
          </button>

          {/* Lists */}
          {FEATURES.lists && (
            <>
              <button
                onClick={() => navigate('/lists')}
                className={navItemClass(listsActive)}
              >
                {createElement(List, { className: 'w-5 h-5 shrink-0' })}
                {!collapsed && <span>Lists</span>}
              </button>
              {!collapsed && listsActive && inlineLists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate('/lists')}
                  className="w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700 transition-all duration-200"
                >
                  <span className="text-[14px] truncate">{l.icon ? l.icon : <ConceptIcon name="list" size={14} decorative />} {l.title}</span>
                </button>
              ))}
              {!collapsed && listsActive && moreListsCount > 0 && (
                <button
                  onClick={() => navigate('/lists')}
                  className="w-full flex items-center gap-3 pl-9 pr-3.5 py-1.5 text-[13px] text-neutral-400 hover:text-neutral-600"
                >
                  All lists ({allLists.length}) →
                </button>
              )}
            </>
          )}

          {/* House */}
          <button
            onClick={() => navigate('/home')}
            className={navItemClass(homeAppActive)}
            aria-label="House"
          >
            {createElement(Home, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>House</span>}
          </button>
          {!collapsed && homeAppActive && inlineRooms.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/home/space/${r.id}`)}
              className={`w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200 ${location.pathname === `/home/space/${r.id}` ? 'text-primary-700 bg-primary-50/60 font-medium' : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'}`}
            >
              <span className="text-[14px] truncate">{r.name}</span>
            </button>
          ))}
          {!collapsed && homeAppActive && moreRoomsCount > 0 && (
            <button
              onClick={() => navigate('/home')}
              className="w-full flex items-center gap-3 pl-9 pr-3.5 py-1.5 text-[13px] text-neutral-400 hover:text-neutral-600"
            >
              All rooms ({rooms.length}) →
            </button>
          )}

          {/* History */}
          <button
            onClick={() => navigate('/history')}
            className={navItemClass(location.pathname.startsWith('/history'))}
          >
            {createElement(History, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>History</span>}
          </button>

          {/* Registry-driven apps (Jobs, …) with a sidebar spec. */}
          {appRegistry
            .filter((a) => a.sidebar)
            .sort((a, b) => a.sidebar!.order - b.sidebar!.order)
            .map((app) => {
              const Icon = app.sidebar!.icon
              const isActive = location.pathname === app.route || location.pathname.startsWith(`${app.route}/`)
              return (
                <button
                  key={app.id}
                  onClick={() => navigate(app.route)}
                  className={navItemClass(isActive)}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>{app.sidebar!.label}</span>}
                </button>
              )
            })}
        </SidebarGroup>

      </nav>

      {/* Account and settings stay together at the foot of the navigation. */}
      <div className={`symphony-sidebar-footer p-3 border-t border-neutral-200/60 ${collapsed ? 'text-center' : ''}`}>
        {!collapsed && (userName || userEmail) && (
          <div className="px-3 pt-2 pb-3 text-sm font-medium text-neutral-800 truncate" title={userEmail}>
            {firstName}
          </div>
        )}
        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          className={navItemClass(location.pathname.startsWith('/settings'))}
        >
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className={navItemClass(false)}
            aria-label="Sign out"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        )}


      </div>
    </aside>
  )
}
