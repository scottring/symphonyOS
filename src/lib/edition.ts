import { supabase } from '@/lib/supabase'

export type Edition = 'light' | 'full'

/**
 * Asks the server which edition the signed-in household is on. Returns null
 * on any error or unexpected answer: the server enforces the edition, so a
 * failed lookup must show the app rather than lock a full household out.
 */
export async function loadEdition(): Promise<Edition | null> {
  try {
    const { data, error } = await supabase.rpc('my_edition')
    if (error) return null
    return data === 'light' || data === 'full' ? data : null
  } catch {
    return null
  }
}

const fullKey = (userId: string) => `symphony.edition.full.${userId}`

export function isFullRememberedLocally(userId: string): boolean {
  try { return localStorage.getItem(fullKey(userId)) === '1' } catch { return false }
}

export function rememberFullLocally(userId: string): void {
  try { localStorage.setItem(fullKey(userId), '1') } catch { /* private mode: just ask again next time */ }
}
