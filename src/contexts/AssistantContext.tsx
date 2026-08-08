// src/contexts/AssistantContext.tsx
//
// The ONE Symphony assistant instance. Before this, Shell.tsx and
// ShellLayout.tsx each called useSymphonyAssistant with the same persistKey,
// so navigating between Today and anywhere else swapped which conversation you
// were looking at and the other one appeared to vanish. Hoisting the hook here
// means the conversation follows you.
//
// Any new assistant surface should consume this rather than mounting its own
// instance. (Entity-scoped chats — AssistDrawer, GuideChat — are deliberately
// separate and keep their own.)

import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden'
import { useMobile } from '@/hooks/useMobile'

type AssistantValue = ReturnType<typeof useSymphonyAssistant> & {
  open: boolean
  setOpen: (v: boolean) => void
}

const AssistantContext = createContext<AssistantValue | null>(null)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const assistant = useSymphonyAssistant({ persistKey: 'symphony_rail' })
  const isMobile = useMobile()
  const { pathname } = useLocation()

  // Desktop: persisted (localStorage, cross-tab synced) — the rail stays where
  // the user left it. Mobile: ephemeral, because the mobile rail is a
  // fixed inset-0 overlay and a persisted "open" would reload into a screen
  // covering the whole app.
  const { hidden, setHidden } = useScratchpadHidden()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Mobile can't keep a full-screen overlay up over a page you navigated to.
  useEffect(() => {
    if (isMobile) setMobileOpen(false)
  }, [pathname, isMobile])

  const open = isMobile ? mobileOpen : !hidden
  const setOpen = useCallback(
    (v: boolean) => { if (isMobile) setMobileOpen(v); else setHidden(!v) },
    [isMobile, setHidden],
  )

  const value = useMemo<AssistantValue>(
    () => ({ ...assistant, open, setOpen }),
    [assistant, open, setOpen],
  )

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export function useAssistant(): AssistantValue {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error('useAssistant must be used inside <AssistantProvider>')
  return ctx
}
