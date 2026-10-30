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

export type DesktopScreenshot =
  | { status: 'ok'; file: File }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'unsupported' }

/**
 * ⌘K's Screenshot tile, Mac shell edition: the shell hides Symphony, runs
 * macOS's own region picker over whatever is behind, comes back, and hands
 * the picture over. The shell acks at once with `shell:screenshot-started`;
 * a browser, or a shell built before this existed, never does — that reads as
 * 'unsupported' and the box falls back to paste / drop.
 */
export async function requestDesktopScreenshot(ackTimeoutMs = 1500): Promise<DesktopScreenshot> {
  const tauri = getTauri()
  if (!tauri) return { status: 'unsupported' }
  let started = false
  let resolve!: (result: DesktopScreenshot) => void
  const done = new Promise<DesktopScreenshot>((r) => { resolve = r })
  // Listen BEFORE asking: an ack emitted ahead of the listener is lost, and a
  // lost ack would wrongly read as an old shell.
  const unlisten = await Promise.all([
    tauri.event.listen('shell:screenshot-started', () => { started = true }),
    tauri.event.listen('shell:screenshot-result', (e) => {
      const p = (e.payload ?? {}) as { image?: string | null; error?: string | null }
      if (p.error) resolve({ status: 'error', message: p.error })
      else if (!p.image) resolve({ status: 'cancelled' })
      else {
        const bytes = Uint8Array.from(atob(p.image), (c) => c.charCodeAt(0))
        resolve({ status: 'ok', file: new File([bytes], 'screenshot.jpg', { type: 'image/jpeg' }) })
      }
    }),
  ]).catch(() => null)
  if (!unlisten) return { status: 'unsupported' }
  const timer = setTimeout(() => { if (!started) resolve({ status: 'unsupported' }) }, ackTimeoutMs)
  desktopEmit('shell:screenshot')
  const result = await done
  clearTimeout(timer)
  unlisten.forEach((un) => un())
  return result
}
