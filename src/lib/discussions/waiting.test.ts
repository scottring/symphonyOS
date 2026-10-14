import { describe, it, expect } from 'vitest'
import { discussionPeople, discussionState, othersIn, peopleLabel, stateLine, threadScopeFor } from './waiting'

const SCOTT = 'auth-scott'
const IRIS = 'auth-iris'
const members = [
  { id: 'm-scott', name: 'Scott', user_id: SCOTT, auth_user_id: null, is_full_user: true },
  { id: 'm-iris', name: 'Iris', user_id: SCOTT, auth_user_id: IRIS },
  { id: 'm-ella', name: 'Ella', user_id: SCOTT, auth_user_id: null, is_full_user: false },
]
const msg = (who: string | null, content: string, extra: object = {}) => ({
  role: who ? 'user' : 'assistant', content, timestamp: '2026-10-14T15:52:00Z',
  author: who ? { id: who, name: who === SCOTT ? 'Scott' : 'Iris', kind: 'member' } : { id: null, name: 'Symphony', kind: 'symphony' },
  ...extra,
})

// Scott, 2026-10-14: a message meant for Iris that nothing told her about.
describe('who a discussion is with', () => {
  it('a family thread where Scott wrote to the people is with Iris, and waits on her', () => {
    const s = { user_id: SCOTT, scope: 'compound', messages: [msg(SCOTT, 'Iris, we need to review these days')] }
    expect(discussionPeople(s, members)).toEqual([SCOTT, IRIS])
    expect(othersIn(s, members, SCOTT)).toEqual(['Iris'])
    expect(othersIn(s, members, IRIS)).toEqual(['Scott'])
    expect(discussionState(s, members, SCOTT)).toEqual({ kind: 'waiting-on-them', names: ['Iris'] })
    expect(discussionState(s, members, IRIS)).toEqual({ kind: 'waiting-on-you' })
  })

  it('a family thread where Scott only asked Symphony is just him', () => {
    const s = { user_id: SCOTT, scope: 'compound', messages: [msg(SCOTT, 'what time does it close?', { askedSymphony: true }), msg(null, '6pm')] }
    expect(discussionPeople(s, members)).toEqual([SCOTT])
    expect(discussionState(s, members, SCOTT)).toEqual({ kind: 'just-you' })
  })

  it('a chosen person makes it with them even before a word, and on a private item opens only the thread', () => {
    const s = { user_id: SCOTT, scope: 'couple', with_user_ids: [IRIS], messages: [] }
    expect(othersIn(s, members, SCOTT)).toEqual(['Iris'])
    expect(discussionState(s, members, SCOTT)).toEqual({ kind: 'empty' })
    expect(threadScopeFor('individual', [IRIS])).toBe('couple')
    expect(threadScopeFor('compound', [IRIS])).toBe('compound')
    expect(threadScopeFor('individual', [])).toBe('individual')
  })

  it('Iris replies: it waits on Scott; settled waits on no one', () => {
    const s = { user_id: SCOTT, scope: 'compound', with_user_ids: [IRIS], messages: [msg(SCOTT, 'review these days'), msg(IRIS, 'Nov 3 is out')] }
    expect(discussionState(s, members, SCOTT)).toEqual({ kind: 'waiting-on-you' })
    expect(discussionState(s, members, IRIS)).toEqual({ kind: 'waiting-on-them', names: ['Scott'] })
    expect(discussionState({ ...s, settled_at: '2026-10-14T18:00:00Z' }, members, SCOTT)).toEqual({ kind: 'settled' })
  })

  it('Symphony’s answer waits on whoever asked', () => {
    const s = { user_id: SCOTT, scope: 'compound', with_user_ids: [IRIS], messages: [msg(SCOTT, 'review these'), msg(IRIS, 'which days?', { askedSymphony: true }), msg(null, 'Nov 6 and 16 fit')] }
    expect(discussionState(s, members, IRIS)).toEqual({ kind: 'waiting-on-you' })
    expect(discussionState(s, members, SCOTT)).toEqual({ kind: 'waiting-on-them', names: ['Iris'] })
  })

  it('says it plainly', () => {
    expect(peopleLabel(['Iris'])).toBe('You and Iris')
    expect(peopleLabel([])).toBe('Just you')
    expect(stateLine({ kind: 'waiting-on-them', names: ['Iris'] })).toBe('Waiting on Iris')
    expect(stateLine({ kind: 'waiting-on-you' })).toBe('Waiting on you')
  })
})
