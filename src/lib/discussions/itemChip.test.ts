import { describe, expect, it } from 'vitest'
import { discussionChipLabel, discussionFor, otherLoginNames } from './itemChip'
import type { InboxRow } from './inbox'

const row = (over: Partial<InboxRow>): InboxRow => ({
  sessionId: 's1', entityType: 'task', entityId: 't1', title: 'Summer camp', lastAuthor: 'Iris', lastText: 'Which week?',
  lastAt: new Date(), unread: false, state: { kind: 'waiting-on-you' }, others: ['Iris'], waitingOn: [], scope: 'couple',
  settledAt: null, settledBy: null, outcome: null, ...over,
})

const members = [
  { id: 'm1', name: 'Scott', auth_user_id: 'a-scott', user_id: 'a-scott', is_full_user: true },
  { id: 'm2', name: 'Iris', auth_user_id: 'a-iris', user_id: 'a-scott', is_full_user: true },
  { id: 'm3', name: 'Ella', auth_user_id: null, user_id: 'a-scott', is_full_user: false },
]

describe('discussion chip', () => {
  it('before anything is said, names the household\'s other login', () => {
    expect(otherLoginNames(members, 'a-scott')).toEqual(['Iris'])
    expect(discussionChipLabel(undefined, ['Iris'])).toBe('Talk to Iris')
  })
  it('says whose turn it is once a discussion exists', () => {
    expect(discussionChipLabel(row({}), ['Iris'])).toBe('With Iris · waiting on you')
    expect(discussionChipLabel(row({ state: { kind: 'waiting-on-them', names: ['Iris'] } }), ['Iris'])).toBe('With Iris · waiting on Iris')
    expect(discussionChipLabel(row({ state: { kind: 'settled' } }), ['Iris'])).toBe('With Iris · settled')
  })
  it('a thread with just Symphony says so; no one else to name falls back to Discussion', () => {
    expect(discussionChipLabel(row({ others: [], state: { kind: 'just-you' } }), ['Iris'])).toBe('Discussion · just you')
    expect(discussionChipLabel(undefined, [])).toBe('Discussion')
  })
  it('finds the item\'s open discussion before a settled one', () => {
    const rows = [row({ sessionId: 'old', state: { kind: 'settled' } }), row({ sessionId: 'open' }), row({ sessionId: 'x', entityId: 't2' })]
    expect(discussionFor(rows, 'task', 't1')?.sessionId).toBe('open')
    expect(discussionFor(rows, 'event', 't1')).toBeUndefined()
  })
})
