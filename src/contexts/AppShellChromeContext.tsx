import React from 'react'

export interface AppShellChromeContextValue {
  chatOpen: boolean
  onChatOpenChange: (open: boolean) => void
}

export const AppShellChromeContext = React.createContext<AppShellChromeContextValue | null>(null)

export function useAppShellChrome(): AppShellChromeContextValue {
  const ctx = React.useContext(AppShellChromeContext)
  if (!ctx) throw new Error('useAppShellChrome must be used within AppShell')
  return ctx
}

/** The chrome, or null outside an AppShell. For components that want to react
 *  to the assistant rail but must still render without one (HomeView is
 *  mounted bare in tests). */
export function useAppShellChromeOptional(): AppShellChromeContextValue | null {
  return React.useContext(AppShellChromeContext)
}
