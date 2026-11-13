import { supabase } from '@/lib/supabase'

export type Edition = 'light' | 'full'

/**
 * Asks the server which edition the signed-in household is on. Returns null
 * on any error or unexpected answer: the server enforces the edition, so a
 * failed lookup must show the app rather than lock a full household out.
 */
export const EDITION_LOOKUP_TIMEOUT_MS = 8000

export async function loadEdition(): Promise<Edition | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  // A lookup that never settles (stalled auth lock, dead network) must not
  // strand the user on "Loading...": time out as null, which shows the app.
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), EDITION_LOOKUP_TIMEOUT_MS) })
  try {
    const lookup = (async () => {
      const { data, error } = await supabase.rpc('my_edition')
      if (error) return null
      return data === 'light' || data === 'full' ? (data as Edition) : null
    })()
    return await Promise.race([lookup, timeout])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const fullKey = (userId: string) => `symphony.edition.full.${userId}`

export function isFullRememberedLocally(userId: string): boolean {
  try { return localStorage.getItem(fullKey(userId)) === '1' } catch { return false }
}

export function rememberFullLocally(userId: string): void {
  try { localStorage.setItem(fullKey(userId), '1') } catch { /* private mode: just ask again next time */ }
}
