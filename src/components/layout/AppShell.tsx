import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  children: ReactNode
  panel?: ReactNode
  sidebarCollapsed: boolean
  onSidebarToggle: () => void
  panelOpen: boolean
  userEmail?: string
  onSignOut?: () => void
}

export function AppShell({
  children,
  panel,
  sidebarCollapsed,
  onSidebarToggle,
  panelOpen,
  userEmail,
  onSignOut,
}: AppShellProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-bg-base">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={onSidebarToggle}
        userEmail={userEmail}
        onSignOut={onSignOut}
      />

      {/* Main content area */}
      <main
        className={`
          flex-1 overflow-auto
          transition-all duration-300 ease-in-out
          ${panelOpen ? 'mr-[400px]' : ''}
        `}
      >
        {children}
      </main>

      {/* Detail panel */}
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
    </div>
  )
}
