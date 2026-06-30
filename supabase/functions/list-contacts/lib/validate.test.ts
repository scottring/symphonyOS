import { describe, it, expect } from 'vitest'
import { parseContactsResponse } from './validate'

describe('parseContactsResponse', () => {
  it('passes through a well-formed list and coerces flags', () => {
    const out = parseContactsResponse({
      contacts: [{ contactId: 'grandma', name: 'Grandma', photoURL: 'x', favorite: true, enabled: true }],
    })
    expect(out.contacts).toHaveLength(1)
    expect(out.contacts[0]).toMatchObject({ contactId: 'grandma', name: 'Grandma', favorite: true })
  })
  it('drops entries missing a contactId or name', () => {
    const out = parseContactsResponse({
      contacts: [{ contactId: '', name: 'X' }, { contactId: 'y' }, { contactId: 'z', name: 'Z' }],
    })
    expect(out.contacts.map((c) => c.contactId)).toEqual(['z'])
  })
  it('returns an empty list for malformed input', () => {
    expect(parseContactsResponse(null).contacts).toEqual([])
    expect(parseContactsResponse({}).contacts).toEqual([])
    expect(parseContactsResponse({ contacts: 'nope' }).contacts).toEqual([])
  })
  it('never leaks a phoneNumber field even if present upstream', () => {
    const out = parseContactsResponse({
      contacts: [{ contactId: 'g', name: 'G', phoneNumber: '+13015551234', favorite: false, enabled: true }],
    })
    expect((out.contacts[0] as Record<string, unknown>).phoneNumber).toBeUndefined()
  })
})
