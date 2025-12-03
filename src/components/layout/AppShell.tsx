import type { ReactNode } from 'react'
import { Sidebar, type ViewType } from './Sidebar'
import { QuickCapture } from './QuickCapture'
import { useMobile } from '@/hooks/useMobile'
import symphonyLogo from '@/assets/symphony-logo.jpg'

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
  quickAddOpen?: boolean
  onOpenQuickAdd?: () => void
  onCloseQuickAdd?: () => void
  activeView: ViewType
  onViewChange: (view: ViewType) => void
}

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
  quickAddOpen = false,
  onOpenQuickAdd,
  onCloseQuickAdd,
  activeView,
  onViewChange,
}: AppShellProps) {
  const isMobile = useMobile()

  return (
    <div className="h-screen flex overflow-hidden bg-bg-base">
      {/* Sidebar - hidden on mobile */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={onSidebarToggle}
          userEmail={userEmail}
          onSignOut={onSignOut}
          activeView={activeView}
          onViewChange={onViewChange}
        />
      )}

      {/* Main content area */}
      <main
        className={`
          flex-1 overflow-auto
          transition-all duration-300 ease-in-out
          ${!isMobile && panelOpen ? 'mr-[420px]' : ''}
        `}
      >
        {/* Mobile header */}
        {isMobile && (
          <header className="sticky top-0 z-10 glass border-b border-neutral-200/50 px-5 py-4 safe-top">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={symphonyLogo}
                  alt="Symphony"
                  className="w-9 h-9 rounded-xl object-cover"
                />
                <span className="font-display text-lg font-semibold text-neutral-900">Symphony</span>
              </div>
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
          </header>
        )}
        {children}
      </main>

      {/* Quick Capture - FAB shown on all pages when panel is closed */}
      {onQuickAdd && (
        <QuickCapture
          onAdd={onQuickAdd}
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
          {/* Backdrop for click-outside-to-close */}
          {panelOpen && onPanelClose && (
            <div
              className="fixed inset-0 z-10 bg-neutral-900/5"
              onClick={onPanelClose}
              aria-hidden="true"
            />
          )}
          <aside
            className={`
              fixed top-0 right-0 h-full w-[420px]
              bg-bg-elevated border-l border-neutral-200/80
              transform transition-transform duration-300 ease-out
              ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
              shadow-xl z-20
            `}
          >
            {panel}
          </aside>
        </>
      )}

      {/* Mobile bottom navigation */}
      {isMobile && !panelOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-neutral-200/50 safe-bottom">
          <div className="flex items-center justify-around px-6 py-3">
            <button
              onClick={() => onViewChange('home')}
              className={`
                flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all
                ${activeView === 'home'
                  ? 'text-primary-600'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              <span className={`text-xs font-medium ${activeView === 'home' ? 'font-semibold' : ''}`}>Home</span>
            </button>

            <button
              onClick={() => onViewChange('projects')}
              className={`
                flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all
                ${activeView === 'projects'
                  ? 'text-blue-600'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className={`text-xs font-medium ${activeView === 'projects' ? 'font-semibold' : ''}`}>Projects</span>
            </button>

            <button
              onClick={() => onViewChange('routines')}
              className={`
                flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all
                ${activeView === 'routines'
                  ? 'text-amber-600'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              <span className={`text-xs font-medium ${activeView === 'routines' ? 'font-semibold' : ''}`}>Routines</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
