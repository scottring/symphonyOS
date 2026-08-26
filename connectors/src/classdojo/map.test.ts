import { describe, it, expect } from 'vitest'
import { toDojoPosts, toConnectorMessages, discoverTargets, type FeedItem, type DojoPost } from './map'

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  _id: 'p1',
  time: '2026-08-25T13:00:00Z',
  targetId: 'class-a',
  targetType: 'class',
  senderName: 'Mr. Gorby',
  headerText: 'Gorby',
  headerSubtext: '3-01 - Mr. Gorby',
  contents: { body: 'Picture day is Friday. Wear school colors.', attachments: [] },
  ...over,
})

const post = (over: Partial<DojoPost> = {}): DojoPost => ({
  id: 'p1',
  createdAt: '2026-08-25T13:00:00Z',
  author: 'Mr. Gorby',
  body: 'Picture day is Friday.',
  targetId: 'class-a',
  targetLabel: '3-01 - Mr. Gorby',
  ...over,
})

describe('toDojoPosts', () => {
  it('maps a feed item to a post', () => {
    const [p] = toDojoPosts([item()])
    expect(p).toEqual({
      id: 'p1',
      createdAt: '2026-08-25T13:00:00Z',
      author: 'Mr. Gorby',
      body: 'Picture day is Friday. Wear school colors.',
      targetId: 'class-a',
      targetLabel: '3-01 - Mr. Gorby',
    })
  })

  it('skips pending and scheduled posts, which are not live yet', () => {
    expect(toDojoPosts([item({ pending: true }), item({ _id: 'p2', scheduled: true })])).toEqual([])
  })

  it('falls back to the header text when senderName is missing', () => {
    expect(toDojoPosts([item({ senderName: undefined })])[0].author).toBe('Gorby')
  })

  it('drops an item with no body rather than emitting a blank line', () => {
    expect(toDojoPosts([item({ contents: { body: '   ', attachments: [] } })])).toEqual([])
  })

  it('keeps school-level posts, not just class posts', () => {
    const out = toDojoPosts([item({ targetType: 'school', targetId: 'school-a' })])
    expect(out[0].targetId).toBe('school-a')
  })
})

describe('toConnectorMessages', () => {
  it('maps a post to a connector message', () => {
    const [m] = toConnectorMessages([post()], null)
    expect(m.sender).toBe('Mr. Gorby')
    expect(m.text).toBe('Picture day is Friday.')
    expect(m.timestamp.toISOString()).toBe('2026-08-25T13:00:00.000Z')
  })

  it('drops posts at or before the since mark', () => {
    const posts = [
      post({ id: 'old', createdAt: '2026-08-24T13:00:00Z', body: 'old' }),
      post({ id: 'new', createdAt: '2026-08-25T13:00:00Z', body: 'new' }),
    ]
    expect(toConnectorMessages(posts, new Date('2026-08-24T13:00:00Z')).map((m) => m.text)).toEqual(['new'])
  })

  it('returns everything when there is no since mark', () => {
    expect(toConnectorMessages([post(), post({ id: 'p2' })], null)).toHaveLength(2)
  })

  it('drops a post with an unparseable date rather than sending epoch zero', () => {
    expect(toConnectorMessages([post({ createdAt: 'not a date' })], null)).toEqual([])
  })

  it('orders posts oldest first', () => {
    const posts = [
      post({ id: 'b', createdAt: '2026-08-25T15:00:00Z', body: 'second' }),
      post({ id: 'a', createdAt: '2026-08-25T13:00:00Z', body: 'first' }),
    ]
    expect(toConnectorMessages(posts, null).map((m) => m.text)).toEqual(['first', 'second'])
  })
})


describe('discoverTargets', () => {
  // The storyFeed is combined across every class AND school a parent belongs
  // to, and the worker keeps only the targets on the allowlist. Silently
  // dropping the rest is how the school-wide channel carrying PTO notices
  // went unread for a week — so what was dropped has to be reportable.
  it('reports a target that is in the feed but not watched', () => {
    const found = discoverTargets(
      [post({ targetId: 'school-x', targetLabel: 'Hampden Elementary' })],
      ['class-a'],
    )
    expect(found).toEqual([{ targetId: 'school-x', label: 'Hampden Elementary', posts: 1 }])
  })

  it('says nothing about targets already watched', () => {
    expect(discoverTargets([post({ targetId: 'class-a' })], ['class-a'])).toEqual([])
  })

  it('counts the posts per unwatched target, so a busy channel stands out', () => {
    const found = discoverTargets([
      post({ id: '1', targetId: 'school-x', targetLabel: 'Hampden Elementary' }),
      post({ id: '2', targetId: 'school-x', targetLabel: 'Hampden Elementary' }),
      post({ id: '3', targetId: 'art-y', targetLabel: 'Art with Ms. Diaz' }),
    ], ['class-a'])
    expect(found).toEqual([
      { targetId: 'school-x', label: 'Hampden Elementary', posts: 2 },
      { targetId: 'art-y', label: 'Art with Ms. Diaz', posts: 1 },
    ])
  })

  it('falls back to the target id when the feed carries no label', () => {
    expect(discoverTargets([post({ targetId: 'z', targetLabel: '' })], [])[0]!.label).toBe('z')
  })
})
