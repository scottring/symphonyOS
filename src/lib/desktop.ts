// Bridge to the Tauri Mac shell (desktop/ at repo root). The shell remote-loads
// the deployed app with `withGlobalTauri`, so `window.__TAURI__` existing is the
// signal that we're inside it. Every function here degrades to a no-op in a
// plain browser — callers never need to branch.

interface TauriEventApi {
  listen: (event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>
  emit: (event: string, payload?: unknown) => Promise<void>
}

interface TauriGlobal {
  event: TauriEventApi
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal
  }
}

function getTauri(): TauriGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return window.__TAURI__
}

export function isDesktopShell(): boolean {
  return getTauri() !== undefined
}

export function desktopEmit(event: string, payload?: unknown): void {
  void getTauri()?.event.emit(event, payload).catch(() => {})
}

/** Subscribe to a shell event. Returns an unsubscribe function. */
export function onDesktopEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const tauri = getTauri()
  if (!tauri) return () => {}
  const unlisten = tauri.event.listen(event, (e) => handler(e.payload as T))
  return () => {
    void unlisten.then((un) => un()).catch(() => {})
  }
}
