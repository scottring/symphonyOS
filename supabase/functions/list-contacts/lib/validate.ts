// Pure parsing for the list-contacts proxy. Display fields only — phone numbers
// are stripped defensively even if the upstream ever includes them.

export interface ContactListItemDTO {
  contactId: string
  name: string
  photoURL?: string
  favorite: boolean
  enabled: boolean
}

export function parseContactsResponse(raw: unknown): { contacts: ContactListItemDTO[] } {
  const list = (raw as { contacts?: unknown })?.contacts
  if (!Array.isArray(list)) return { contacts: [] }
  const contacts: ContactListItemDTO[] = []
  for (const item of list) {
    const v = item as Record<string, unknown>
    const contactId = typeof v.contactId === 'string' ? v.contactId : ''
    const name = typeof v.name === 'string' ? v.name : ''
    if (!contactId || !name) continue
    contacts.push({
      contactId,
      name,
      photoURL: typeof v.photoURL === 'string' ? v.photoURL : undefined,
      favorite: !!v.favorite,
      enabled: v.enabled !== false,
    })
  }
  return { contacts }
}
