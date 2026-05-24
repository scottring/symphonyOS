import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { Sun } from 'lucide-react'
import { WallV2EventCard } from './WallV2EventCard'
import type { WallV2TimelineEvent } from './types'

function makeEvent(over: Partial<WallV2TimelineEvent> = {}): WallV2TimelineEvent {
  return { id: 'task-1', icon: Sun, tint: 'honey', title: 'Buy groceries', ...over }
}

describe('WallV2EventCard complete checkbox', () => {
  it('toggles complete (next state true) when an open item is checked', async () => {
    const onToggleComplete = vi.fn()
    const { user } = render(
      <WallV2EventCard event={makeEvent({ completed: false })} onToggleComplete={onToggleComplete} />,
    )
    await user.click(screen.getByRole('button', { name: /mark complete: Buy groceries/i }))
    expect(onToggleComplete).toHaveBeenCalledWith('task-1', true)
  })

  it('toggles back to incomplete when a completed item is tapped', async () => {
    const onToggleComplete = vi.fn()
    const { user } = render(
      <WallV2EventCard event={makeEvent({ completed: true })} onToggleComplete={onToggleComplete} />,
    )
    await user.click(screen.getByRole('button', { name: /mark incomplete: Buy groceries/i }))
    expect(onToggleComplete).toHaveBeenCalledWith('task-1', false)
  })

  it('shows no checkbox for synthetic (non-completable) cards', () => {
    render(
      <WallV2EventCard event={makeEvent({ id: 'dinner-x', title: 'Family dinner' })} onToggleComplete={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /mark (in)?complete/i })).not.toBeInTheDocument()
  })
})
