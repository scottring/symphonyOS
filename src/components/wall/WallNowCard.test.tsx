import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallNowCard } from './WallNowCard'

describe('WallNowCard', () => {
  it('renders imminent event title for imminent focus', () => {
    render(
      <WallNowCard
        focus={{ kind: 'imminent', entity: { kind: 'event', entity: { title: 'Soccer practice' }, startTime: new Date(Date.now() + 10 * 60_000) } as any }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
      />
    )
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
  })

  it('renders the mode-default label for mode-default focus', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
      />
    )
    expect(screen.getByText(/dinner/i)).toBeInTheDocument()
  })

  it('toggles pin on pin button tap', () => {
    const onPinToggle = vi.fn()
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={onPinToggle}
        familyPrompt={null}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onPinToggle).toHaveBeenCalled()
  })

  it('shows family conversation prompt chip when in dinner mode with prompt', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt="What made you laugh today?"
      />
    )
    expect(screen.getByText(/what made you laugh today/i)).toBeInTheDocument()
  })

  it('does not show family prompt chip in non-dinner modes', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'morning' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt="Question of the day"
      />
    )
    expect(screen.queryByText(/question of the day/i)).not.toBeInTheDocument()
  })
})
