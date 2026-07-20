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
