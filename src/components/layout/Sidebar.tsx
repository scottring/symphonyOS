import { useEffect, createElement } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PinnedSection } from '@/components/pins'
import { useDomain } from '@/hooks/useDomain'
import { useHomeView } from '@/hooks/useHomeView'
import { appRegistry } from '@/shell/appRegistry'
import { SidebarGroup } from './SidebarGroup'
import { useSidebarGroupState } from '@/hooks/useSidebarGroupState'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useLists } from '@/hooks/useLists'
import { WeatherChip } from '@/components/schedule/WeatherChip'
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
  Calendar,
  Users2,
  List,
  Repeat,
  History,
  Settings,
  LogOut,
} from 'lucide-react'

const HOME_VIEW_STORAGE_KEY = 'symphony-home-view'

// Feature flags for in-progress features
const FEATURES = {
  lists: true,
}

export type ViewType = 'agent' | 'home' | 'home-app' | 'today' | 'inbox' | 'goals' | 'projects' | 'routines' | 'lists' | 'contacts' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'meals' | 'morning' | 'bedtime' | 'weekly-planning' | 'family-member'

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
  const { currentDomain } = useDomain()
  const { currentView: homeCurrentView } = useHomeView()
  // currentDomain used for future domain-aware logic; suppress unused warning
  void currentDomain

  const { state: groupState, toggle: toggleGroup, setOpen: openGroup } = useSidebarGroupState()

  // Auto-expand the group containing the current view. "This Week" and
  // "Calendar" both route to activeView='today', so they can't be detected
  // here — the PLAN group just keeps its persisted open/closed state for those.
  // Group→state-key mapping: PLAN→'plan', HOME→'spaces', MORE→'library'.
  const planActive =
    activeView === 'projects' || activeView === 'routines'
  const homeActive =
    activeView === 'meals' || activeView === 'home-app' || activeView === 'lists'
  const moreActive =
    activeView === 'contacts' || activeView === 'contact-detail' || activeView === 'history' ||
    location.pathname.startsWith('/jobs')

  useEffect(() => {
    if (planActive) openGroup('plan')
    if (homeActive) openGroup('spaces')
    if (moreActive) openGroup('library')
  }, [planActive, homeActive, moreActive, openGroup])

  const homeAppActive = activeView === 'home-app'
  const listsActive = activeView === 'lists'

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

  const firstName = (userName || userEmail || '').split(/[\s@]/)[0] || 'there'
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
      <div className="px-5 pt-8 pb-3 flex items-center justify-between">
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center w-full' : ''}`}>
          <img src="/symphony-logo.jpg" alt="Symphony" className="w-7 h-7 rounded-full object-cover shrink-0" />
          {!collapsed && (
            <span className="font-display text-2xl font-semibold text-neutral-900">Symphony</span>
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
            <p className="font-display text-base text-neutral-900 leading-tight">
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
          </button>
        )}
      </div>

      {/* Pinned Section */}
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

      {/* Navigation — grouped into TODAY / PLAN / HOME / MORE.
          TODAY (Today + Inbox) is always visible; the rest are collapsible. */}
      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto">
        <div className="border-t border-neutral-200/60 mb-1" />

        {/* ── TODAY (always visible) ── */}
        {!collapsed && (
          <p className="px-3.5 pt-3 pb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
            Today
          </p>
        )}

        {/* Today — also forces HomeView D/W/M back to 'today' so clicking
            this link from Week/Workweek/Month returns the user to Day view. */}
        <button
          onClick={() => {
            try {
              localStorage.setItem(HOME_VIEW_STORAGE_KEY, 'today')
              window.dispatchEvent(new StorageEvent('storage', {
                key: HOME_VIEW_STORAGE_KEY,
                newValue: 'today',
              }))
            } catch { /* ignore — falls back to next-mount read */ }
            onViewChange('today')
          }}
          className={navItemClass(activeView === 'today' && homeCurrentView === 'today')}
        >
          {createElement(Sun, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Today</span>}
        </button>

        {/* Inbox */}
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

        {/* ── PLAN ── This Week · Projects · Routines · Calendar */}
        <SidebarGroup
          label="Plan"
          open={groupState.plan}
          onToggle={() => toggleGroup('plan')}
          forceOpen={planActive}
          collapsed={collapsed}
        >
          {/* This Week — navigates to /today and forces HomeView D/W/M into 'week'. */}
          <button
            onClick={() => {
              try {
                localStorage.setItem(HOME_VIEW_STORAGE_KEY, 'week')
                window.dispatchEvent(new StorageEvent('storage', {
                  key: HOME_VIEW_STORAGE_KEY,
                  newValue: 'week',
                }))
              } catch { /* ignore — falls back to next-mount read */ }
              onViewChange('today')
            }}
            className={navItemClass(activeView === 'today' && (homeCurrentView === 'week' || homeCurrentView === 'workweek'))}
          >
            {createElement(CalendarRange, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>This Week</span>}
          </button>

          {/* Projects */}
          <button
            onClick={() => onViewChange('projects')}
            className={navItemClass(activeView === 'projects')}
          >
            {createElement(FolderKanban, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Projects</span>}
          </button>

          {/* Routines */}
          <button
            onClick={() => onViewChange('routines')}
            className={navItemClass(activeView === 'routines')}
          >
            {createElement(Repeat, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Routines</span>}
          </button>

          {/* Calendar */}
          <button
            onClick={() => onViewChange('today')}
            className={navItemClass(false)}
          >
            {createElement(Calendar, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Calendar</span>}
          </button>
        </SidebarGroup>

        {/* ── HOME ── Meals · Lists · House */}
        <SidebarGroup
          label="Home"
          open={groupState.spaces}
          onToggle={() => toggleGroup('spaces')}
          forceOpen={homeActive}
          collapsed={collapsed}
        >
          {/* Meals */}
          <button
            onClick={() => onViewChange('meals')}
            className={navItemClass(activeView === 'meals')}
          >
            {createElement(UtensilsCrossed, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Meals</span>}
          </button>
          {!collapsed && activeView === 'meals' && (
            <>
              <button
                onClick={() => navigate('/meals/shelf')}
                className={`w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200 ${location.pathname.startsWith('/meals/shelf') ? 'text-primary-700 bg-primary-50/60 font-medium' : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'}`}
              >
                <span className="text-[14px]">Shelf</span>
              </button>
              <button
                onClick={() => navigate('/meals/habits')}
                className={`w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200 ${location.pathname.startsWith('/meals/habits') ? 'text-primary-700 bg-primary-50/60 font-medium' : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'}`}
              >
                <span className="text-[14px]">Habits</span>
              </button>
            </>
          )}

          {/* Lists */}
          {FEATURES.lists && (
            <>
              <button
                onClick={() => onViewChange('lists')}
                className={navItemClass(activeView === 'lists')}
              >
                {createElement(List, { className: 'w-5 h-5 shrink-0' })}
                {!collapsed && <span>Lists</span>}
              </button>
              {!collapsed && listsActive && inlineLists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onViewChange('lists')}
                  className="w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700 transition-all duration-200"
                >
                  <span className="text-[14px] truncate">{l.icon ? l.icon : <ConceptIcon name="list" size={14} decorative />} {l.title}</span>
                </button>
              ))}
              {!collapsed && listsActive && moreListsCount > 0 && (
                <button
                  onClick={() => onViewChange('lists')}
                  className="w-full flex items-center gap-3 pl-9 pr-3.5 py-1.5 text-[13px] text-neutral-400 hover:text-neutral-600"
                >
                  All lists ({allLists.length}) →
                </button>
              )}
            </>
          )}

          {/* House (was "Home" — renamed per Scott; same destination) */}
          <button
            onClick={() => onViewChange('home-app')}
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
        </SidebarGroup>

        {/* ── MORE ── Contacts · History · Jobs (+ any registry apps) */}
        <SidebarGroup
          label="More"
          open={groupState.library}
          onToggle={() => toggleGroup('library')}
          forceOpen={moreActive}
          collapsed={collapsed}
        >
          {/* Contacts */}
          <button
            onClick={() => onViewChange('contacts')}
            className={navItemClass(activeView === 'contacts' || activeView === 'contact-detail')}
          >
            {createElement(Users2, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Contacts</span>}
          </button>

          {/* History */}
          <button
            onClick={() => onViewChange('history')}
            className={navItemClass(activeView === 'history')}
          >
            {createElement(History, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>History</span>}
          </button>

          {/* Registry-driven apps (Jobs, …) — folded in from the old Apps group */}
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
          onClick={() => onViewChange('settings')}
          className={`
            flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-all duration-200 text-[15px]
            ${activeView === 'settings'
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
            <img
              src="/house-photo.jpg"
              alt=""
              aria-hidden="true"
              className="w-32 h-32 rounded-full object-cover select-none pointer-events-none"
            />
            <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
              Everything in its Right Place
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
