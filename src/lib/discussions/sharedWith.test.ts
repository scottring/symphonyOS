import { describe, it, expect } from 'vitest'
import { sharedWithNames, sharedWithLabel, canOfferShare } from './sharedWith'

// Scott is the household creator: his seed row has no auth_user_id, only
// user_id + is_full_user. Iris has her own login. Kids have neither.
const members = [
  { name: 'Scott', user_id: 'u1', auth_user_id: null, is_full_user: true },
  { name: 'Iris', user_id: 'u1', auth_user_id: 'u2', is_full_user: false },
  { name: 'Liam', user_id: 'u1', auth_user_id: null, is_full_user: false },
]

describe('sharedWithNames', () => {
  it('names the other login-holding members on a compound thread', () => {
    expect(sharedWithNames(members, 'u1', 'compound')).toEqual(['Iris'])
  })

  it('excludes the viewer when the viewer is the linked member', () => {
    expect(sharedWithNames(members, 'u2', 'couple')).toEqual(['Scott'])
  })

  it('never names kids or guests', () => {
    expect(sharedWithNames(members, 'u1', 'compound')).not.toContain('Liam')
  })

  it('is empty on an individual thread', () => {
    expect(sharedWithNames(members, 'u1', 'individual')).toEqual([])
  })
})

describe('sharedWithLabel', () => {
  it('reads Only you when nobody else can see it', () => {
    expect(sharedWithLabel([], 'individual')).toBe('Only you')
    expect(sharedWithLabel([], 'compound')).toBe('Only you')
  })

  it('names one, two, or more people', () => {
    expect(sharedWithLabel(['Iris'], 'compound')).toBe('Shared with Iris')
    expect(sharedWithLabel(['Iris', 'Nana'], 'compound')).toBe('Shared with Iris and Nana')
    expect(sharedWithLabel(['Iris', 'Nana', 'Pop'], 'compound')).toBe('Shared with Iris, Nana, and Pop')
  })
})

// A discussion is worth offering to share only when it's currently private
// AND there's someone else with a login to share it with.
describe('canOfferShare', () => {
  it('offers when the thread is individual and at least two members hold a login', () => {
    expect(canOfferShare('individual', members)).toBe(true)
  })

  it('never offers on a thread that is already shared', () => {
    expect(canOfferShare('compound', members)).toBe(false)
    expect(canOfferShare('couple', members)).toBe(false)
  })

  it('does not offer when fewer than two members hold a login', () => {
    const soloHousehold = [{ name: 'Scott', user_id: 'u1', auth_user_id: null, is_full_user: true }]
    expect(canOfferShare('individual', soloHousehold)).toBe(false)
  })
})
