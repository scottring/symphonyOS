import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WallV2AssistantLine } from './WallV2AssistantLine'
import type { UnpromptedItem } from '@/hooks/useUnpromptedSuggestions'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

function item(overrides: Partial<ProactiveSuggestion> = {}): UnpromptedItem {
  return {
    urgency: 75,
    critical: false,
    suggestion: {
      id: 's1', userId: 'u1', entityType: 'task', entityId: 't1',
      suggestionType: 'call', title: 'Call Camp Notre Dame',
      detail: '11 days overdue', confidence: 0.9, actionType: 'call',
      actionPayload: { phoneNumber: '555-0100' }, status: 'active',
      suggestionKey: 'task:t1:call', generatedAt: '', createdAt: '', updatedAt: '',
      ...overrides,
    },
  }
}

describe('WallV2AssistantLine', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(
      <WallV2AssistantLine item={null} onAct={vi.fn()} onSnooze={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the title, detail, and a Call action for a phone suggestion', () => {
    render(<WallV2AssistantLine item={item()} onAct={vi.fn()} onSnooze={vi.fn()} />)
    expect(screen.getByText('Call Camp Notre Dame')).toBeInTheDocument()
    expect(screen.getByText('11 days overdue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Call' })).toBeInTheDocument()
  })

  it('degrades a link suggestion to Show me — URL schemes are inert on the Pi', () => {
    render(
      <WallV2AssistantLine
        item={item({ actionType: 'open_link', actionPayload: { url: 'https://x.test' } })}
        onAct={vi.fn()}
        onSnooze={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Show me' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Call' })).not.toBeInTheDocument()
  })

  it('gives both buttons kiosk-scale touch targets', () => {
    render(<WallV2AssistantLine item={item()} onAct={vi.fn()} onSnooze={vi.fn()} />)
    // 8-foot viewing distance: a 60px minimum is the kiosk floor.
    expect(screen.getByRole('button', { name: 'Call' }).className).toContain('min-h-[60px]')
    expect(screen.getByRole('button', { name: 'Not now' }).className).toContain('min-h-[60px]')
  })

  it('passes the resolved action to onAct so the shell can route it', () => {
    const onAct = vi.fn()
    render(<WallV2AssistantLine item={item()} onAct={onAct} onSnooze={vi.fn()} />)
    screen.getByRole('button', { name: 'Call' }).click()
    expect(onAct).toHaveBeenCalledWith(
      { kind: 'wall_call', phoneNumber: '555-0100' },
      expect.objectContaining({ urgency: 75 }),
    )
  })

  it('renders the policy verdicts under ?why=1 even with nothing to say', () => {
    render(
      <WallV2AssistantLine
        item={null}
        onAct={vi.fn()}
        onSnooze={vi.fn()}
        showWhy
        decisions={[{ id: 'a', title: 'Plan the season', urgency: 80, reason: 'outside_window' }]}
      />,
    )
    expect(screen.getByText(/Plan the season — urgency 80 — outside_window/)).toBeInTheDocument()
  })
})
