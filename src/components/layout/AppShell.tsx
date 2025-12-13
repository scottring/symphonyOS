import type { ReactNode } from 'react'
import { Sidebar, type ViewType } from './Sidebar'
import { QuickCapture } from './QuickCapture'
import { useMobile } from '@/hooks/useMobile'
import symphonyLogo from '@/assets/symphony-logo.jpg'
import type { PinnedItem } from '@/types/pin'
import type { PinnableEntityType } from '@/types/pin'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'

interface EntityData {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists: Array<{ id: string; name: string }>
}

interface AppShellProps {
  children: ReactNode
  panel?: ReactNode
  sidebarCollapsed: boolean
  onSidebarToggle: () => void
  panelOpen: boolean
  onPanelClose?: () => void
  userEmail?: string
  onSignOut?: () => void
  onQuickAdd?: (title: string) => void
  // Rich add with parsed fields (for natural language parser)
  onQuickAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
    category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
  }) => void
  // Context for QuickCapture parser
  quickAddProjects?: Array<{ id: string; name: string }>
  quickAddContacts?: Array<{ id: string; name: string }>
  quickAddOpen?: boolean
  onOpenQuickAdd?: () => void
  onCloseQuickAdd?: () => void
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onOpenSearch?: () => void
  // Pinned items props
  pins?: PinnedItem[]
  entities?: EntityData
  onPinNavigate?: (entityType: PinnableEntityType, entityId: string) => void
  onPinMarkAccessed?: (entityType: PinnableEntityType, entityId: string) => void
  onPinRefreshStale?: (id: string) => void
}

// Mobile nav items configuration
const mobileNavItems = [
  {
    id: 'home' as const,
    label: 'Today',
    activeColor: 'text-primary-600',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: 'projects' as const,
    label: 'Projects',
    activeColor: 'text-blue-600',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h7l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      </svg>
    ),
  },
  {
    id: 'routines' as const,
    label: 'Routines',
    activeColor: 'text-amber-600',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
      </svg>
    ),
  },
]

export function AppShell({
  children,
  panel,
  sidebarCollapsed,
  onSidebarToggle,
  panelOpen,
  onPanelClose,
  userEmail,
  onSignOut,
  onQuickAdd,
  onQuickAddRich,
  quickAddProjects,
  quickAddContacts,
  quickAddOpen = false,
  onOpenQuickAdd,
  onCloseQuickAdd,
  activeView,
  onViewChange,
  onOpenSearch,
  pins,
  entities,
  onPinNavigate,
  onPinMarkAccessed,
  onPinRefreshStale,
}: AppShellProps) {
  const isMobile = useMobile()

  return (
    <div className="h-screen flex overflow-hidden overflow-x-hidden bg-bg-base w-full max-w-[100vw]">
      {/* Atmospheric background gradient - desktop only */}
      {!isMobile && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          {/* Warm gradient wash */}
          <div
            className="absolute -top-1/4 right-0 w-[900px] h-[900px] opacity-[0.03] blur-3xl"
            style={{ background: 'radial-gradient(circle, hsl(168 45% 35%) 0%, transparent 70%)' }}
          />
          {/* Secondary accent */}
          <div
            className="absolute -bottom-1/4 -left-1/4 w-[700px] h-[700px] opacity-[0.025] blur-3xl"
            style={{ background: 'radial-gradient(circle, hsl(38 70% 50%) 0%, transparent 70%)' }}
          />
          {/* Subtle grain overlay */}
          <div className="absolute inset-0 opacity-[0.012]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
          }} />
        </div>
      )}

      {/* Sidebar - hidden on mobile */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={onSidebarToggle}
          userEmail={userEmail}
          onSignOut={onSignOut}
          activeView={activeView}
          onViewChange={onViewChange}
          onOpenSearch={onOpenSearch}
          pins={pins}
          entities={entities}
          onPinNavigate={onPinNavigate}
          onPinMarkAccessed={onPinMarkAccessed}
          onPinRefreshStale={onPinRefreshStale}
        />
      )}

      {/* Main content area */}
      <main
        className={`
          relative z-10 flex-1 overflow-auto overflow-x-hidden
          transition-all duration-300 ease-in-out
          ${!isMobile && panelOpen ? 'mr-[420px]' : ''}
          ${isMobile ? 'pb-16' : ''}
        `}
        style={isMobile ? { paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        {/* Mobile header - refined glass effect */}
        {isMobile && (
          <header
            className="sticky top-0 z-10 backdrop-blur-xl border-b border-neutral-200/40"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
              background: 'linear-gradient(to bottom, rgba(250, 250, 249, 0.95), rgba(250, 250, 249, 0.9))',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <img
                    src={symphonyLogo}
                    alt="Symphony"
                    className="w-9 h-9 rounded-xl object-cover shadow-sm ring-1 ring-neutral-200/50"
                  />
                  {/* Status dot */}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-primary-500 rounded-full border-2 border-white" />
                </div>
                <div>
                  <span className="font-display text-lg font-semibold text-neutral-900 tracking-tight">Symphony</span>
                  <p className="text-[9px] text-neutral-400 -mt-0.5 font-medium tracking-wide">PERSONAL OS</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {onOpenSearch && (
                  <button
                    onClick={onOpenSearch}
                    className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 active:bg-neutral-100 transition-all"
                    aria-label="Search"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  </button>
                )}
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 active:bg-neutral-100 transition-all"
                    aria-label="Sign out"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </header>
        )}
        {children}
      </main>

      {/* Quick Capture - FAB shown on all pages when panel is closed */}
      {onQuickAdd && (
        <QuickCapture
          onAdd={onQuickAdd}
          onAddRich={onQuickAddRich}
          projects={quickAddProjects}
          contacts={quickAddContacts}
          isOpen={quickAddOpen}
          onOpen={onOpenQuickAdd}
          onClose={onCloseQuickAdd}
          showFab={!panelOpen}
        />
      )}

      {/* Detail panel - full screen overlay on mobile */}
      {isMobile ? (
        <div
          className={`
            fixed inset-0 z-50 bg-bg-elevated
            transform transition-transform duration-300 ease-out
            ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
            safe-top safe-bottom
          `}
        >
          {panel}
        </div>
      ) : (
        <>
          {/* Backdrop for click-outside-to-close with refined overlay */}
          {panelOpen && onPanelClose && (
            <div
              className="fixed inset-0 z-10 bg-neutral-900/10 backdrop-blur-[1px] transition-opacity duration-300"
              onClick={onPanelClose}
              aria-hidden="true"
            />
          )}
          <aside
            className={`
              fixed top-0 right-0 h-full w-[420px]
              bg-bg-elevated/95 backdrop-blur-xl border-l border-neutral-200/60
              transform transition-all duration-300 ease-out
              ${panelOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}
              z-20
            `}
          >
            {/* Decorative gradient at top */}
            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-white/50 to-transparent pointer-events-none" />
            <div className="relative h-full">
              {panel}
            </div>
          </aside>
        </>
      )}

      {/* Mobile bottom navigation - refined with glass effect */}
      {isMobile && !panelOpen && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t border-neutral-200/40"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            background: 'linear-gradient(to top, rgba(250, 250, 249, 0.98), rgba(250, 250, 249, 0.92))',
          }}
        >
          <div className="flex items-center justify-around px-6 py-1">
            {mobileNavItems.map((item) => {
              const isActive = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`
                    relative flex flex-col items-center gap-0.5 px-5 py-2 rounded-xl transition-all duration-200
                    ${isActive
                      ? item.activeColor
                      : 'text-neutral-400 active:text-neutral-600'
                    }
                  `}
                >
                  {/* Active indicator dot */}
                  {isActive && (
                    <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current" />
                  )}
                  <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
