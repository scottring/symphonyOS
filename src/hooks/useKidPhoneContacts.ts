import { useEffect, useMemo, useState } from 'react'
import { fetchKidPhoneContacts, type KidPhoneContact } from '@/lib/telephony/listContacts'

export const CONTACTS_CACHE_KEY = 'wallv2.kidphone.contacts.v1'

export function readCachedContacts(store: Pick<Storage, 'getItem'>): KidPhoneContact[] {
  try {
    const raw = store.getItem(CONTACTS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as KidPhoneContact[]) : []
  } catch {
    return []
  }
}

export function writeCachedContacts(store: Pick<Storage, 'setItem'>, contacts: KidPhoneContact[]): void {
  try {
    store.setItem(CONTACTS_CACHE_KEY, JSON.stringify(contacts))
  } catch {
    /* ignore quota/serialization errors — cache is best-effort */
  }
}

/** A contact the kid-phone allowlist has switched off can't be called, so it
 *  never shows in the phone book. The feed's `enabled` flag is the source of
 *  truth; a contact missing the flag (older cache) is treated as enabled. */
export function callableContacts(contacts: KidPhoneContact[]): KidPhoneContact[] {
  return contacts.filter((c) => c.enabled !== false)
}

export function partitionContacts(contacts: KidPhoneContact[]): {
  favorites: KidPhoneContact[]
  others: KidPhoneContact[]
} {
  const byName = (a: KidPhoneContact, b: KidPhoneContact) => a.name.localeCompare(b.name)
  const callable = callableContacts(contacts)
  return {
    favorites: callable.filter((c) => c.favorite).sort(byName),
    others: callable.filter((c) => !c.favorite).sort(byName),
  }
}

/** Fetch the kid-phone contacts feed when `enabled` becomes true. Seeds from the
 *  last-good localStorage cache so the phone book never flashes empty. */
export function useKidPhoneContacts(enabled: boolean) {
  const store = typeof window !== 'undefined' ? window.localStorage : undefined
  const [contacts, setContacts] = useState<KidPhoneContact[]>(() =>
    store ? readCachedContacts(store) : [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(undefined)
    fetchKidPhoneContacts().then((r) => {
      if (cancelled) return
      if (r.ok) {
        setContacts(r.contacts)
        if (store) writeCachedContacts(store, r.contacts)
      } else {
        setError(r.error) // keep showing cached contacts
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const { favorites, others } = useMemo(() => partitionContacts(contacts), [contacts])
  return { contacts, favorites, others, loading, error }
}
