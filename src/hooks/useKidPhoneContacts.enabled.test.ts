import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/telephony/listContacts', () => ({ fetchKidPhoneContacts: vi.fn() }))
import { partitionContacts, callableContacts } from './useKidPhoneContacts'

describe('disabled kidsPhone contacts', () => {
  const contacts = [
    { contactId: 'g', name: 'Grandma', favorite: true, enabled: true },
    { contactId: 'o', name: 'Old', favorite: true, enabled: false },
    { contactId: 'i', name: 'Iris', favorite: false, enabled: true },
    { contactId: 'n', name: 'Nope', favorite: false, enabled: false },
  ]

  it('never reach the phone book', () => {
    const { favorites, others } = partitionContacts(contacts)
    expect(favorites.map((c) => c.contactId)).toEqual(['g'])
    expect(others.map((c) => c.contactId)).toEqual(['i'])
  })

  it('a cached contact without the flag counts as enabled', () => {
    const legacy = { contactId: 'l', name: 'Legacy', favorite: false } as unknown as (typeof contacts)[number]
    expect(callableContacts([legacy])).toHaveLength(1)
  })
})
