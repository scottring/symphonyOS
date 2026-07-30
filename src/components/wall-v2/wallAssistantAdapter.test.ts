import { describe, it, expect } from 'vitest'
import { toWallAction, wallActionLabel } from './wallAssistantAdapter'
import type { ProactiveSuggestion, SuggestionActionType } from '@/types/proactiveSuggestion'

const s = (
  actionType: string,
  payload: Record<string, unknown> = {},
): ProactiveSuggestion => ({
  id: 'x', userId: 'u', entityType: 'task', entityId: 't', suggestionType: 'call',
  title: 't', confidence: 1, actionType: actionType as SuggestionActionType,
  actionPayload: payload, status: 'active', suggestionKey: 'k',
  generatedAt: '', createdAt: '', updatedAt: '',
})

describe('toWallAction', () => {
  it('routes call into the wall phone flow, never tel:', () => {
    expect(toWallAction(s('call', { phoneNumber: '555' })))
      .toEqual({ kind: 'wall_call', phoneNumber: '555' })
  })

  it('degrades a call with no number to Show me', () => {
    expect(toWallAction(s('call'))).toEqual({ kind: 'show_me' })
  })

  it.each(['email', 'text', 'open_link', 'navigate', 'create_task', 'guided_chat'])(
    'degrades %s to Show me — those schemes are dead on a Pi kiosk',
    (t) => {
      expect(toWallAction(s(t, {
        email: 'a@b.c', url: 'https://x', phoneNumber: '5', location: 'Boston',
      }))).toEqual({ kind: 'show_me' })
    },
  )

  it('never produces an action carrying a URL scheme', () => {
    for (const t of ['email', 'text', 'open_link', 'navigate']) {
      const a = toWallAction(s(t, {
        url: 'https://x', email: 'a@b.c', phoneNumber: '5', location: 'Boston',
      }))
      expect(JSON.stringify(a)).not.toMatch(/mailto|sms:|https?:/)
    }
  })

  it('labels only the call action as Call', () => {
    expect(wallActionLabel(toWallAction(s('call', { phoneNumber: '5' })))).toBe('Call')
    expect(wallActionLabel(toWallAction(s('email', { email: 'a@b.c' })))).toBe('Show me')
  })
})
