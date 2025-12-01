import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { QuickCapture } from './QuickCapture'
import { useMobile } from '@/hooks/useMobile'

interface AppShellProps {
  children: ReactNode
  panel?: ReactNode
  sidebarCollapsed: boolean
  onSidebarToggle: () => void
  panelOpen: boolean
  userEmail?: string
  onSignOut?: () => void
  onQuickAdd?: (title: string) => void
}

export function AppShell({
  children,
  panel,
  sidebarCollapsed,
  onSidebarToggle,
  panelOpen,
  userEmail,
  onSignOut,
  onQuickAdd,
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
        />
      )}

      {/* Main content area */}
      <main
        className={`
          flex-1 overflow-auto
          transition-all duration-300 ease-in-out
          ${!isMobile && panelOpen ? 'mr-[400px]' : ''}
        `}
      >
        {/* Mobile header */}
        {isMobile && (
          <header className="sticky top-0 z-10 bg-bg-elevated border-b border-neutral-200 px-4 py-3 safe-top">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <span className="font-semibold text-neutral-800">Symphony</span>
              </div>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
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

      {/* Mobile Quick Capture FAB */}
      {isMobile && onQuickAdd && !panelOpen && (
        <QuickCapture onAdd={onQuickAdd} />
      )}

      {/* Detail panel - full screen overlay on mobile */}
      {isMobile ? (
        // Mobile: Full screen overlay
        <div
          className={`
            fixed inset-0 z-50 bg-bg-elevated
            transform transition-transform duration-300 ease-in-out
            ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
            safe-top safe-bottom
          `}
        >
          {panel}
        </div>
      ) : (
        // Desktop: Side panel
        <aside
          className={`
            fixed top-0 right-0 h-full w-[400px]
            bg-bg-elevated border-l border-neutral-200
            transform transition-transform duration-300 ease-in-out
            ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
            shadow-xl z-20
          `}
        >
          {panel}
        </aside>
      )}
    </div>
  )
}
