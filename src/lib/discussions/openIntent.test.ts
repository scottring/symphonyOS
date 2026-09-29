import { describe, it, expect, beforeEach } from 'vitest'
import { requestDiscussionOpen, consumeDiscussionOpen, _resetDiscussionOpenIntent } from './openIntent'

describe('discussion open intent', () => {
  beforeEach(() => { _resetDiscussionOpenIntent() })

  it('is consumed once, only by the item it was asked for', () => {
    requestDiscussionOpen('task', 't1')
    expect(consumeDiscussionOpen('task', 't2')).toBe(false)
    expect(consumeDiscussionOpen('routine', 't1')).toBe(false)
    expect(consumeDiscussionOpen('task', 't1')).toBe(true)
    expect(consumeDiscussionOpen('task', 't1')).toBe(false)
  })

  it('a later request replaces an earlier one', () => {
    requestDiscussionOpen('task', 't1')
    requestDiscussionOpen('event', 'e9')
    expect(consumeDiscussionOpen('task', 't1')).toBe(false)
    expect(consumeDiscussionOpen('event', 'e9')).toBe(true)
  })
})
