import { describe, expect, it } from 'vitest'
import { buildSchoolMailReview, isForwardingConfirmation } from './review'
import type { EmailExtraction } from './types'
const blank: EmailExtraction = {
  events: [],
  todos: [],
  good_to_know: [],
  gaps: [],
}
const members = [{ id: 'c', name: 'Casey', isChild: true }, {
  id: 'p',
  name: 'Pat',
  isChild: false,
}]
describe('school email proposals', () => {
  it('keeps a dated event and its preparations distinct and reviewable', () => {
    const result = buildSchoolMailReview(
      {
        ...blank,
        events: [{
          title: 'Picture day',
          date: '2026-10-20',
          for: 'everyone',
          confidence: 1,
          source_quote: 'Picture day Tuesday; pack the form the night before.',
          items: [{
            text: 'Pack the form',
            for: 'everyone',
            needed: 'night_before',
            kind: 'homework',
          }],
        }],
      },
      members,
      '2026-10-16',
    )
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      date: '2026-10-20',
      time: null,
      memberIds: ['c'],
    })
    expect(result.items[1]).toMatchObject({
      date: '2026-10-19',
      kind: 'homework',
      memberIds: ['c'],
    })
  })
  it('keeps unspecified dates empty and standing instructions as routines', () => {
    const result = buildSchoolMailReview(
      {
        ...blank,
        todos: [{
          title: 'Return the form',
          kind: 'todo',
          source_quote: 'Return the form',
          confidence: 1,
        }, {
          title: 'Bring folder',
          kind: 'todo',
          source_quote: 'Every weekday',
          repeat: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
          confidence: 1,
        }],
      },
      members,
      '2026-10-16',
    )
    expect(result.items[0].date).toBeNull()
    expect(result.items[1]).toMatchObject({
      kind: 'routine',
      date: null,
      showOnTimeline: true,
    })
  })
  it('does not guess an ambiguous child assignment', () => {
    const result = buildSchoolMailReview(
      {
        ...blank,
        todos: [{
          title: 'Reading log',
          for: ['Casey'],
          kind: 'homework',
          source_quote: 'Casey’s log',
          confidence: 1,
        }],
      },
      [...members, { id: 'c2', name: 'Casey Smith', isChild: true }],
      '2026-10-16',
    )
    expect(result.items[0].memberIds).toEqual([])
    expect(result.items[0].warning).toMatch(/Check who/)
  })
  it('flags old dates and preserves unreadable attachment gaps', () => {
    const result = buildSchoolMailReview(
      {
        ...blank,
        events: [{
          title: 'Past event',
          date: '2025-01-01',
          for: 'everyone',
          confidence: 1,
          source_quote: 'January 1 2025',
          items: [],
        }],
        gaps: [{
          kind: 'unreadable_attachment',
          note: 'Read the attached PDF',
        }],
      },
      members,
      '2026-10-16',
    )
    expect(result.items[0].warning).toMatch(/past/)
    expect(result.gaps).toEqual(['Read the attached PDF'])
  })
  it('information remains a notice suggestion, never a task', () => {
    expect(
      buildSchoolMailReview(
        {
          ...blank,
          good_to_know: [{
            text: 'Office hours have changed',
            for: 'everyone',
          }],
        },
        members,
        '2026-10-16',
      ).items[0].kind,
    ).toBe('notice')
  })
  it('recognizes provider confirmations without treating similar senders as trusted', () => {
    expect(
      isForwardingConfirmation(
        'Gmail <forwarding-noreply@google.com>',
        'Gmail Forwarding Confirmation',
      ),
    ).toBe(true)
    expect(
      isForwardingConfirmation(
        'forwarding-noreply@google.com.evil.test',
        'Gmail Forwarding Confirmation',
      ),
    ).toBe(false)
  })
})
