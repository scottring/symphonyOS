import { useEffect, createElement } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PinnedSection } from '@/components/pins'
import { appRegistry } from '@/shell/appRegistry'
import { SidebarGroup } from './SidebarGroup'
import { useSidebarGroupState } from '@/hooks/useSidebarGroupState'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useLists } from '@/hooks/useLists'
import { WeatherChip } from '@/components/schedule/WeatherChip'
import { PlaceMedallion } from '@/components/place/PlaceMedallion'
import type { PinnedItem } from '@/types/pin'
import type { PinnableEntityType } from '@/types/pin'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'
import { ConceptIcon } from '@/lib/conceptIcons'
import {
  Sun,
  CalendarRange,
  UtensilsCrossed,
  FolderKanban,
  Home,
  Inbox,
  Users2,
  List,
  FileText,
  NotebookPen,
  Repeat,
  History,
  Settings,
  LogOut,
} from 'lucide-react'

// Feature flags for in-progress features
const FEATURES = {
  lists: true,
}

export type ViewType = 'agent' | 'home' | 'home-app' | 'today' | 'inbox' | 'goals' | 'projects' | 'routines' | 'lists' | 'contacts' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'meals' | 'weekly-planning' | 'family-member' | 'us'

interface EntityData {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists: Array<{ id: string; name: string }>
}

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
  // Pinned items props
  pins?: PinnedItem[]
  entities?: EntityData
  onPinNavigate?: (entityType: PinnableEntityType, entityId: string) => void
  onPinMarkAccessed?: (entityType: PinnableEntityType, entityId: string) => void
  onPinRefreshStale?: (id: string) => void
}

function getGreetingWord(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
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
  pins = [],
  entities,
  onPinNavigate,
  onPinMarkAccessed,
  onPinRefreshStale,
}: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const { state: groupState, toggle: toggleGroup, setOpen: openGroup } = useSidebarGroupState()

  // The rhythm spine (Phase 2b): Inbox · the horizon rungs · Routines · Library.
  // The Library group (Projects, Goals, Meals, Contacts, Lists, House, History,
  // + registry apps) auto-expands when any of its destinations is the active
  // route. Group→state-key: LIBRARY→'library'.
  //
  // Routines is deliberately absent from this list now that it sits outside the
  // group: leaving it in would throw Library open every time you visited a page
  // that is no longer in it.
  const libraryActive =
    activeView === 'projects' ||
    activeView === 'goals' || activeView === 'meals' ||
    activeView === 'home-app' || activeView === 'lists' ||
    activeView === 'contacts' || activeView === 'contact-detail' ||
    activeView === 'history' ||
    location.pathname.startsWith('/projects') ||
    location.pathname.startsWith('/goals') || location.pathname.startsWith('/meals') ||
    location.pathname.startsWith('/lists') || location.pathname.startsWith('/contacts') ||
    location.pathname.startsWith('/history') || location.pathname.startsWith('/home') ||
    location.pathname.startsWith('/jobs') || location.pathname.startsWith('/documents') ||
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
  const greetingWord = getGreetingWord()

  // Nav item helper
  function navItemClass(active: boolean): string {
    return `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-[15px] ${
      active
        ? 'bg-primary-50 text-primary-700 font-medium'
        : 'text-neutral-600 hover:bg-neutral-100/70'
    } ${collapsed ? 'justify-center' : ''}`
  }

  return (
    <aside
      className={`
        h-full bg-[hsl(38_40%_96%)] border-r border-neutral-200/60
        flex flex-col
        transition-all duration-500
        ${collapsed ? 'w-[68px]' : 'w-64'}
      `}
    >
      {/* Header: logo + name */}
      <div className="p-5 flex items-center justify-between">
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center w-full' : ''}`}>
          <img src="/symphony-logo.jpg" alt="Symphony" className="w-7 h-7 rounded-full object-cover shrink-0" />
          {!collapsed && (
            <span className="font-brand text-[22px] tracking-[0.01em] text-neutral-900">Symphony</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-neutral-300 hover:text-neutral-500 transition-colors"
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
          className="mx-auto mt-1 p-1.5 rounded-md text-neutral-300 hover:text-neutral-500 transition-colors"
          aria-label="Expand sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Greeting block */}
      {!collapsed && (
        <div className="px-5 pb-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 grid place-items-center text-sm font-semibold shrink-0">
            {(userName ?? userEmail ?? 'S').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-neutral-500">Good {greetingWord},</p>
            <p className="text-base font-medium text-neutral-900 leading-tight">
              {firstName}
              <Sun className="w-3.5 h-3.5 text-amber-500 inline ml-1" />
            </p>
          </div>
        </div>
      )}

      {/* Weather — moved here from the Today header (single home, always visible) */}
      {!collapsed && (
        <div className="px-5 pb-2">
          <WeatherChip />
        </div>
      )}

      {/* Search row. Chat + Wall icons removed in Phase 1 (sidebar restraint);
          chat has its own surfaces and Wall is a rarely-used cross-tab action. */}
      <div className={`px-3 mt-1 flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className={`
              flex-1 flex items-center gap-2 px-3 py-2 rounded-lg
              text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/70
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
              <kbd className="text-[10px] text-neutral-300 border border-neutral-200 rounded px-1 py-0.5 font-sans">
                ⌘K
              </kbd>
            )}
          </button>
        )}
      </div>

      {/* Navigation — the rhythm (Today · This Week · Routines), then
          Household (Inbox · pins), then Library (collapsible). */}
      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto">
        <div className="border-t border-neutral-200/60 mb-1" />

        {/* Today — the execution surface, and now the FIRST thing in the nav.
            Inbox used to sit above it as the "capture catch-all". That put a
            holding pen for unsorted stuff at the top of the app, above the
            three surfaces the product is actually for, and read as a claim
            that processing the pile ranks with living the day. Today · This
            Week · Routines are the conceptual core; capture and lists are
            household plumbing and now sit under their own heading below.

            The horizon ladder was de-navved 2026-08 (analog-planning pivot);
            planning happens on paper and enters as data. */}
        <button
          onClick={() => onViewChange('today')}
          className={`${navItemClass(isTodayActive())} mt-2`}
        >
          <Sun className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Today</span>}
        </button>

        {/* This Week — the provisioning bench (streamlined vision Phase 1):
            where the landed paper plan gets dressed with the context execution
            needs. A surface with its own route, NOT a horizon rung. */}
        <button
          onClick={() => navigate('/week')}
          className={navItemClass(location.pathname === '/week' || location.pathname.startsWith('/week/'))}
        >
          <CalendarRange className="w-5 h-5 shrink-0" />
          {!collapsed && <span>This Week</span>}
        </button>

        {/* Routines sits under the ladder but NOT in it, separated by nothing
            more than its own spacing.

            Every rung above answers one question — how far out am I looking? —
            and moving between them changes magnification, not subject. Routines
            answers "what recurs?", so putting it in the ladder would cost the
            section the single question that makes it readable at a glance. But
            it isn't a peer of Contacts and Documents either: the page renders
            as a rhythm (daily arc, week strip, seasonal shelf), and burying it
            in Library was the thing that felt wrong. Adjacent, not inside. */}
        {/* mt-3: without it this butts straight up against Someday and reads as
            a seventh rung, which is the one thing it must not look like. The
            gap is the whole distinction — no divider, because a rule would
            announce a new section instead of a neighbour. */}
        <button
          onClick={() => navigate('/routines')}
          className={`mt-3 ${navItemClass(location.pathname.startsWith('/routines'))}`}
        >
          {createElement(Repeat, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Routines</span>}
        </button>

        {/* ── Household ── the plumbing under the rhythm: what came in, and
            what's pinned to hand. Below Today/This Week/Routines on purpose —
            these are things you keep, not surfaces you live in. */}
        {!collapsed && (
          <div className="px-3.5 pt-4 pb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
            Household
          </div>
        )}
        {collapsed && <div className="border-t border-neutral-200/60 my-2" />}
        <button
          onClick={() => onViewChange('inbox')}
          className={navItemClass(activeView === 'inbox')}
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

        {pins.length > 0 && entities && onPinNavigate && onPinMarkAccessed && onPinRefreshStale && (
          <PinnedSection
            pins={pins}
            entities={entities}
            collapsed={collapsed}
            onNavigate={onPinNavigate}
            onMarkAccessed={onPinMarkAccessed}
            onRefreshStale={onPinRefreshStale}
          />
        )}

        {/* ── Library ── the non-horizon surfaces, collapsible (not daily clutter). */}
        <div className="border-t border-neutral-200/60 my-2" />
        <SidebarGroup
          label="Library"
          open={groupState.library}
          onToggle={() => toggleGroup('library')}
          forceOpen={libraryActive}
          collapsed={collapsed}
        >
          {/* Projects */}
          <button
            onClick={() => navigate('/projects')}
            className={navItemClass(location.pathname.startsWith('/projects'))}
          >
            {createElement(FolderKanban, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Projects</span>}
          </button>

          {/* Goals is WITHHELD with the horizon ladder (2026-08 analog-planning
              pivot) — route stays live at /goals, just not in daily nav. */}

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

      {/* Footer: Settings + Sign out + illustration + tagline */}
      <div className={`p-3 border-t border-neutral-100 ${collapsed ? 'text-center' : ''}`}>
        <button
          onClick={() => navigate('/settings')}
          className={`
            flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-all duration-200 text-[15px]
            ${location.pathname.startsWith('/settings')
              ? 'bg-primary-50 text-primary-700 font-medium'
              : 'text-neutral-600 hover:bg-neutral-100/70'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg w-full
              text-neutral-600 hover:bg-neutral-100/70
              transition-all duration-200 text-[15px]
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        )}

        {/* Illustration + tagline */}
        {!collapsed && (
          <div className="mt-4 px-3">
            <div aria-hidden="true" className="w-32 h-32 select-none pointer-events-none">
              <PlaceMedallion className="w-full h-full" />
            </div>
            <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
              Everything in its Right Place
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
