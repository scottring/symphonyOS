import { describe, it, expect } from 'vitest'
import { captureConfirmation } from './destination'

describe('captureConfirmation (S1-07)', () => {
  it('names the inbox and the audience, and links there', () => {
    expect(captureConfirmation({ kind: 'inbox', context: null }))
      .toEqual({ message: 'Added to Inbox · Unsorted · only you', route: '/inbox', linkLabel: 'Go to inbox' })
  })

  it('says a family capture is shared', () => {
    expect(captureConfirmation({ kind: 'inbox', context: 'family' }).message)
      .toBe('Added to Inbox · Family · shared with household')
  })

  it('sends a dated capture to the day it landed on', () => {
    expect(captureConfirmation({ kind: 'dated', context: 'work', when: new Date(2026, 8, 25) }))
      .toEqual({ message: 'Added to Fri, Sep 25', route: '/week', linkLabel: 'Go to week' })
    expect(captureConfirmation({ kind: 'dated', context: 'work', when: new Date(), isToday: true }).route)
      .toBe('/today')
  })

  it('routes notes and routines to their own surfaces', () => {
    expect(captureConfirmation({ kind: 'note', context: null }).route).toBe('/notes')
    expect(captureConfirmation({ kind: 'routine', context: 'family' }).route).toBe('/routines')
  })
})
