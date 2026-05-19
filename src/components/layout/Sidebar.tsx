import { useEffect, createElement } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PinnedSection } from '@/components/pins'
import { useDomain } from '@/hooks/useDomain'
import { appRegistry } from '@/shell/appRegistry'
import { SidebarGroup } from './SidebarGroup'
import { useSidebarGroupState } from '@/hooks/useSidebarGroupState'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useLists } from '@/hooks/useLists'
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
  Users,
  FolderKanban,
  Home,
  Inbox,
  Calendar,
  FileText,
  Users2,
  List,
  Settings,
  LogOut,
} from 'lucide-react'

// Feature flags for in-progress features
const FEATURES = {
  notes: true,
  lists: true,
}

export type ViewType = 'agent' | 'home' | 'home-app' | 'today' | 'inbox' | 'goals' | 'projects' | 'routines' | 'lists' | 'notes' | 'contacts' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'meals' | 'morning' | 'bedtime'

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
  onOpenChat?: () => void
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
  onOpenChat,
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
  // currentDomain used for future domain-aware logic; suppress unused warning
  void currentDomain

  const { state: groupState, toggle: toggleGroup, setOpen: openGroup } = useSidebarGroupState()

  const planActive = activeView === 'projects' || activeView === 'routines' || activeView === 'goals'
  const libraryActive =
    activeView === 'notes' || activeView === 'lists' ||
    activeView === 'contacts' || activeView === 'contact-detail' || activeView === 'history'
  const spacesActive = activeView === 'home-app' || activeView === 'meals'

  useEffect(() => {
    if (planActive) openGroup('plan')
    if (libraryActive) openGroup('library')
    if (spacesActive) openGroup('spaces')
  }, [planActive, libraryActive, spacesActive, openGroup])

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
        h-full bg-bg-base border-r border-neutral-200/60
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

      {/* Search + AI/Wall launcher — compact row */}
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
        {onOpenChat && (
          <button
            onClick={onOpenChat}
            className="p-2 rounded-lg text-primary-500 hover:bg-primary-50/80 hover:text-primary-700 transition-colors"
            aria-label="Open AI chat"
            title="AI chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          onClick={() => window.open('/wall', '_blank')}
          className="p-2 rounded-lg text-neutral-400 hover:bg-neutral-100/70 hover:text-neutral-600 transition-colors"
          aria-label="Open Wall in new tab"
          title="Wall"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
          </svg>
        </button>
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

      {/* Navigation — flat list per mockup */}
      <nav className="flex-1 px-3 mt-4 space-y-0.5 overflow-y-auto">
        {/* Today */}
        <button
          onClick={() => onViewChange('today')}
          className={navItemClass(activeView === 'today')}
        >
          {createElement(Sun, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Today</span>}
        </button>

        {/* This Week */}
        <button
          onClick={() => onViewChange('today')}
          className={navItemClass(false)}
        >
          {createElement(CalendarRange, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>This Week</span>}
        </button>

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

        {/* Family */}
        <button
          onClick={() => onViewChange('home-app')}
          className={navItemClass(activeView === 'home-app')}
        >
          {createElement(Users, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Family</span>}
        </button>

        {/* Projects */}
        <button
          onClick={() => onViewChange('projects')}
          className={navItemClass(activeView === 'projects')}
        >
          {createElement(FolderKanban, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Projects</span>}
        </button>

        {/* Home */}
        <button
          onClick={() => onViewChange('home-app')}
          className={navItemClass(false)}
          aria-label="Home"
        >
          {createElement(Home, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Home</span>}
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

        {/* Divider */}
        <div className="border-t border-neutral-200/60 my-3" />

        {/* Calendar */}
        <button
          onClick={() => onViewChange('today')}
          className={navItemClass(false)}
        >
          {createElement(Calendar, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Calendar</span>}
        </button>

        {/* Notes */}
        {FEATURES.notes && (
          <button
            onClick={() => onViewChange('notes')}
            className={navItemClass(activeView === 'notes')}
          >
            {createElement(FileText, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Notes</span>}
          </button>
        )}

        {/* Contacts */}
        <button
          onClick={() => onViewChange('contacts')}
          className={navItemClass(activeView === 'contacts' || activeView === 'contact-detail')}
        >
          {createElement(Users2, { className: 'w-5 h-5 shrink-0' })}
          {!collapsed && <span>Contacts</span>}
        </button>

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

        {/* Apps (registry-driven) */}
        {(() => {
          const registryEntries = appRegistry
            .filter((a) => a.sidebar)
            .sort((a, b) => a.sidebar!.order - b.sidebar!.order)
          if (registryEntries.length === 0) return null
          return (
            <SidebarGroup
              label="Apps"
              open={groupState.apps}
              onToggle={() => toggleGroup('apps')}
              collapsed={collapsed}
            >
              {registryEntries.map((app) => {
                const Icon = app.sidebar!.icon
                const isActive = location.pathname === app.route || location.pathname.startsWith(`${app.route}/`)
                return (
                  <button
                    key={app.id}
                    onClick={() => navigate(app.route)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-[15px]
                      ${isActive
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-neutral-600 hover:bg-neutral-100/70'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && <span>{app.sidebar!.label}</span>}
                  </button>
                )
              })}
            </SidebarGroup>
          )
        })()}
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
          <div className="mt-4 flex flex-col items-center">
            {/* Nordic-watercolor-style house vignette */}
            <div className="w-32 h-28 mx-auto flex items-center justify-center">
              <svg
                viewBox="0 0 128 112"
                className="w-full h-full"
                aria-hidden="true"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Soft vignette background */}
                <ellipse cx="64" cy="60" rx="58" ry="46" fill="hsl(150 25% 92%)" opacity="0.7" />
                {/* Ground ellipse */}
                <ellipse cx="64" cy="92" rx="44" ry="8" fill="hsl(140 22% 86%)" />
                {/* Left tree canopy */}
                <ellipse cx="22" cy="72" rx="13" ry="16" fill="hsl(150 28% 70%)" />
                <ellipse cx="22" cy="68" rx="10" ry="12" fill="hsl(150 25% 78%)" />
                {/* Right tree canopy */}
                <ellipse cx="106" cy="74" rx="12" ry="14" fill="hsl(150 28% 70%)" />
                <ellipse cx="106" cy="70" rx="9" ry="11" fill="hsl(150 25% 78%)" />
                {/* House walls */}
                <rect x="40" y="62" width="48" height="32" rx="2" fill="hsl(38 45% 90%)" />
                {/* Roof */}
                <polygon points="34,64 64,38 94,64" fill="hsl(14 40% 60%)" opacity="0.85" />
                {/* Roof ridge highlight */}
                <polygon points="34,64 64,38 94,64" fill="none" stroke="hsl(14 35% 72%)" strokeWidth="0.5" />
                {/* Door */}
                <rect x="56" y="76" width="16" height="18" rx="3" fill="hsl(150 30% 48%)" opacity="0.75" />
                {/* Door knob */}
                <circle cx="70" cy="86" r="1.5" fill="hsl(38 40% 78%)" />
                {/* Window left */}
                <rect x="43" y="67" width="11" height="9" rx="1.5" fill="hsl(200 30% 88%)" opacity="0.8" />
                {/* Window right */}
                <rect x="74" y="67" width="11" height="9" rx="1.5" fill="hsl(200 30% 88%)" opacity="0.8" />
                {/* Soft sun */}
                <circle cx="98" cy="30" r="10" fill="hsl(45 70% 80%)" opacity="0.55" />
                <circle cx="98" cy="30" r="6" fill="hsl(45 70% 82%)" opacity="0.65" />
              </svg>
            </div>
            <p className="text-xs text-neutral-400 text-center mt-2 px-6 leading-relaxed">
              Everything in one place, so life flows better.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
