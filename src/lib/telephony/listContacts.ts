// Client for the kid-phone contacts feed (powers the wall phone book). Invokes
// the list-contacts edge fn, which proxies kid-phone's secret-gated listContacts.
// Display fields only — no phone numbers ever reach the browser.

import { supabase } from '@/lib/supabase'

export interface KidPhoneContact {
  contactId: string
  name: string
  photoURL?: string
  favorite: boolean
  enabled: boolean
}

export interface KidPhoneContactsResult {
  ok: boolean
  contacts: KidPhoneContact[]
  error?: string
}

export async function fetchKidPhoneContacts(): Promise<KidPhoneContactsResult> {
  const { data, error } = await supabase.functions.invoke('list-contacts', { body: {} })
  if (error) return { ok: false, contacts: [], error: error.message }
  const contacts = (data as { contacts?: KidPhoneContact[] })?.contacts ?? []
  return { ok: true, contacts }
}
