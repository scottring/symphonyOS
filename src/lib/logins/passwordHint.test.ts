import { describe, it, expect } from 'vitest'
import { maskPassword, openableUrl, displayHost, matchesLogin } from './passwordHint'

describe('maskPassword', () => {
  it('keeps the first character and the last two of a long password', () => {
    expect(maskPassword('TomSmith2001')).toBe('T*********01')
  })
  it('keeps only the last one of a medium password', () => {
    expect(maskPassword('abcdef')).toBe('a****f')
  })
  it('hides a very short password entirely', () => {
    expect(maskPassword('abc')).toBe('***')
    expect(maskPassword('')).toBe('')
  })
  it('never returns the password itself', () => {
    for (const pw of ['abcd', 'password', 'Tr0ub4dor&3', 'x'.repeat(40)]) {
      expect(maskPassword(pw)).not.toBe(pw)
      expect(maskPassword(pw)).toHaveLength(pw.length)
    }
  })
})

describe('openableUrl', () => {
  it('adds https to a bare domain', () => {
    expect(openableUrl('comcast.com')).toBe('https://comcast.com')
  })
  it('keeps a full address', () => {
    expect(openableUrl('http://192.168.1.1')).toBe('http://192.168.1.1')
  })
  it('refuses other schemes', () => {
    expect(openableUrl('javascript:alert(1)')).toBeNull()
  })
  it('is null when blank', () => {
    expect(openableUrl('  ')).toBeNull()
    expect(openableUrl(null)).toBeNull()
  })
})

describe('displayHost', () => {
  it('shows the bare host', () => {
    expect(displayHost('https://www.comcast.com/login')).toBe('comcast.com')
  })
})

describe('matchesLogin', () => {
  const login = { site: 'Comcast', url: 'xfinity.com', username: 'scott@example.com', notes: 'internet' }
  it('matches on any field, every word', () => {
    expect(matchesLogin(login, 'xfin')).toBe(true)
    expect(matchesLogin(login, 'comcast internet')).toBe(true)
    expect(matchesLogin(login, 'comcast water')).toBe(false)
  })
  it('matches everything on an empty query', () => {
    expect(matchesLogin(login, '  ')).toBe(true)
  })
})
