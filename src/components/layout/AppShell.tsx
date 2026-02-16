import { useState, type ReactNode } from 'react'
import { Sidebar, type ViewType } from './Sidebar'
import { SidebarKinetic } from './SidebarKinetic'
import { MoreSheet } from './MoreSheet'
import { QuickCapture } from './QuickCapture'
import { useMobile } from '@/hooks/useMobile'
import { useTheme } from '@/hooks/useTheme'
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
  focusModeOpen?: boolean
  userEmail?: string
  userName?: string
  onSignOut?: () => void
  onQuickAdd?: (title: string) => void
  // Rich add with parsed fields (for natural language parser)
  onQuickAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
    category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
    context?: 'work' | 'family' | 'personal'
  }) => void
  // Note creation
  onQuickAddNote?: (data: {
    content: string
    topicName?: string
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

export function AppShell({
  children,
  panel,
  sidebarCollapsed,
  onSidebarToggle,
  panelOpen,
  onPanelClose,
  focusModeOpen = false,
  userEmail,
  userName,
  onSignOut,
  onQuickAdd,
  onQuickAddRich,
  onQuickAddNote,
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
  void onPanelClose // No longer used - panel closing handled by smart handlers in schedule components
  const isMobile = useMobile()
  const { theme } = useTheme()
  const [moreSheetOpen, setMoreSheetOpen] = useState(false)

  return (
    <div className="h-screen flex overflow-hidden overflow-x-hidden bg-bg-base w-full max-w-[100vw]">
      {/* Sidebar - hidden on mobile */}
      {!isMobile && theme === 'kinetic' && (
        <SidebarKinetic
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
      {!isMobile && theme === 'nordic' && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={onSidebarToggle}
          userEmail={userEmail}
          userName={userName}
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
          flex-1 overflow-auto overflow-x-hidden
          transition-all duration-300 ease-in-out
          ${isMobile ? 'pb-14' : ''}
        `}
        style={isMobile
          ? { paddingBottom: 'calc(3rem + env(safe-area-inset-bottom, 0px))' }
          : {
              marginRight: panelOpen && focusModeOpen ? '840px'
                : focusModeOpen ? '420px'
                : panelOpen ? '420px'
                : '0'
            }
        }
      >
        {/* Mobile header */}
        {isMobile && (
          <header className="sticky top-0 z-10 bg-bg-elevated/95 backdrop-blur-lg border-b border-neutral-200/50 px-4 py-1"
                  style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-semibold text-neutral-900">Symphony</span>
              </div>
              <div className="flex items-center gap-1">
                {onOpenSearch && (
                  <button
                    onClick={onOpenSearch}
                    className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
                    aria-label="Search"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
                    aria-label="Sign out"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7z" clipRule="evenodd" />
                      <path d="M7 10a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z" />
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
          onAddNote={onQuickAddNote}
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
        <aside
          className={`
            fixed top-0 h-full w-[420px]
            bg-bg-elevated border-l border-neutral-200/80
            transform transition-all duration-300 ease-out
            ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
            shadow-xl z-20
          `}
          style={{ right: focusModeOpen ? '420px' : '0' }}
        >
          {panel}
        </aside>
      )}

      {/* Mobile bottom navigation — 4 tabs */}
      {isMobile && !panelOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-elevated/95 backdrop-blur-lg border-t border-neutral-200/50"
             style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-around px-4 py-1">
            {/* Today */}
            <button
              onClick={() => onViewChange('today')}
              className={`
                flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-all
                ${activeView === 'today'
                  ? 'text-accent-600'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              <span className={`text-[10px] font-medium ${activeView === 'today' ? 'font-semibold' : ''}`}>Today</span>
            </button>

            {/* Projects */}
            <button
              onClick={() => onViewChange('projects')}
              className={`
                flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-all
                ${activeView === 'projects'
                  ? 'text-blue-600'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className={`text-[10px] font-medium ${activeView === 'projects' ? 'font-semibold' : ''}`}>Projects</span>
            </button>

            {/* More → opens MoreSheet */}
            <button
              onClick={() => setMoreSheetOpen(true)}
              className={`
                relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-all
                ${moreSheetOpen
                  ? 'text-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </nav>
      )}

      {/* MoreSheet — mobile slide-up menu */}
      {isMobile && (
        <MoreSheet
          isOpen={moreSheetOpen}
          onClose={() => setMoreSheetOpen(false)}
          onNavigate={onViewChange}
          activeView={activeView}
        />
      )}
    </div>
  )
}
