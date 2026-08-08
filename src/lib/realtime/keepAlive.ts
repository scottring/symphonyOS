import { supabase } from '@/lib/supabase'

/**
 * Notice when the realtime socket has died, and bring it back.
 *
 * Every data hook subscribes with a bare `.subscribe()` — no status callback,
 * no retry, and nothing anywhere listening for the socket to drop. So when the
 * connection died (sleep, a network change, a server-side close) the app went
 * quiet permanently: no error, no reconnect, just a page that silently stopped
 * updating until it was reloaded. Reported against the Mac shell, where a
 * window can sit untouched for hours, but nothing about it is Mac-specific.
 *
 * This watches at the SOCKET, not per hook. `supabase.realtime` is a singleton
 * shared by all thirteen channels in the app, so one dead socket takes every
 * one of them down together — and one reconnect brings them all back, because
 * the channels rejoin themselves once the transport is up.
 *
 * NOTE: this makes the app RECOVER from a dead socket. It is not a diagnosis of
 * what killed it in the first place, which is still unknown.
 */

/** Fired after a reconnect was actually needed, so data hooks can backfill. */
export const REALTIME_RESUMED_EVENT = 'symphony:realtime-resumed'

/**
 * A reconnect only closes the gap going forward — anything that changed while
 * the socket was down was never delivered and never will be. Consumers listen
 * for this to refetch once, rather than every hook polling on its own.
 */
export function onRealtimeResumed(cb: () => void): () => void {
  window.addEventListener(REALTIME_RESUMED_EVENT, cb)
  return () => window.removeEventListener(REALTIME_RESUMED_EVENT, cb)
}

export function checkRealtimeConnection(): boolean {
  // Hidden tabs are throttled by design; reconnecting one we can't see would
  // burn egress for a page nobody is looking at. The check runs on the way back.
  if (typeof document !== 'undefined' && document.hidden) return false
  // No channels means nothing wants a socket — opening one would be pure cost.
  if (supabase.getChannels().length === 0) return false
  if (supabase.realtime.isConnected()) return false

  supabase.realtime.connect()
  window.dispatchEvent(new Event(REALTIME_RESUMED_EVENT))
  return true
}

/**
 * Check on the transitions that follow a socket death: coming back to the tab,
 * refocusing the window, and the network returning. Deliberately event-driven
 * rather than an interval — a timer is the thing most likely to have been
 * throttled to death in the first place.
 */
export function startRealtimeKeepAlive(): () => void {
  const check = () => { checkRealtimeConnection() }

  document.addEventListener('visibilitychange', check)
  window.addEventListener('focus', check)
  window.addEventListener('online', check)

  return () => {
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('focus', check)
    window.removeEventListener('online', check)
  }
}
