// Wires the Mac shell into the running app: native menu items navigate the
// SPA, ⌘N opens QuickCapture, and task changes stream to the tray extra.
// Mounted once from useShellChrome (present on every Shell route). Everything
// no-ops in a plain browser.
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/task'
import { isDesktopShell, onDesktopEvent, desktopEmit } from '@/lib/desktop'
import { buildTrayPayload } from './trayPayload'

const VIEW_PATHS: Record<string, string> = {
  today: '/',
  inbox: '/inbox',
  projects: '/projects',
  routines: '/routines',
}

export function pathForView(view: string): string | null {
  return VIEW_PATHS[view] ?? null
}

export function useDesktopBridge(tasks: Task[]): void {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isDesktopShell()) return
    const unNav = onDesktopEvent<string>('shell:navigate', (view) => {
      const path = pathForView(view)
      if (path) navigate(path)
    })
    // QuickCapture already opens on ⌘K via a window keydown listener in
    // ShellLayout — synthesize that instead of coupling to its state.
    const unCapture = onDesktopEvent('shell:quick-capture', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    })
    return () => {
      unNav()
      unCapture()
    }
  }, [navigate])

  const payload = useMemo(() => buildTrayPayload(tasks, new Date()), [tasks])
  const lastSent = useRef('')
  useEffect(() => {
    if (!isDesktopShell()) return
    const json = JSON.stringify(payload)
    if (json === lastSent.current) return
    lastSent.current = json
    desktopEmit('shell:tray-update', payload)
  }, [payload])
}
