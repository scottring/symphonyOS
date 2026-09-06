import { describe, it, expect } from 'vitest'
import { decideAssignment } from '@/lib/planAssign'

const M = [
  { id: 'a', name: 'Alex', role: 'parent' }, { id: 'e', name: 'Edith', role: 'parent' },
  { id: 'l', name: 'Liam', role: 'child' }, { id: 'm', name: 'Mia', role: 'child' },
]

describe('decideAssignment', () => {
  it('"Edith: sign field trip form" → Edith does it, prefix stripped', () => {
    expect(decideAssignment('Edith: sign field trip form', null, M, false)).toEqual({ title: 'Sign field trip form', assigneeId: 'e', contactMemberId: null })
  })
  it("\"Renew Edith's passport\" keeps the name and assigns Edith", () => {
    expect(decideAssignment("Renew Edith's passport", null, M, false)).toEqual({ title: "Renew Edith's passport", assigneeId: 'e', contactMemberId: null })
  })
  it('"Mia: dentist 10am" → nobody (an adult drives), Mia is the contact, title says whom', () => {
    expect(decideAssignment('Mia: dentist', 'm', M, false)).toEqual({ title: 'Take Mia to dentist', assigneeId: null, contactMemberId: 'm' })
  })
  it('a kid does their own homework and practice', () => {
    expect(decideAssignment('Liam: finish science poster', null, M, false).assigneeId).toBe('l')
    expect(decideAssignment('Liam soccer practice', 'l', M, false).assigneeId).toBe('l')
    expect(decideAssignment('Liam soccer game', null, M, false).assigneeId).toBe('l')
  })
  it('a goal never carries an assignee', () => {
    expect(decideAssignment('Liam reads 20 min every night', 'l', M, true).assigneeId).toBeNull()
  })
  it('an unknown name is left alone', () => {
    expect(decideAssignment('Call Mom back', null, M, false)).toEqual({ title: 'Call Mom back', assigneeId: null, contactMemberId: null })
  })
  it('a model assignee that is an adult is kept even without a name in the title', () => {
    expect(decideAssignment('Book flights', 'e', M, false).assigneeId).toBe('e')
  })
})
