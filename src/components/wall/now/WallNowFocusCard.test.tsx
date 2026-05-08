import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallNowFocusCard } from './WallNowFocusCard'
import { createMockTask } from '@/test/mocks/factories'

describe('WallNowFocusCard', () => {
  it('renders empty state when no imminent entity', () => {
    render(<WallNowFocusCard imminent={null} now={new Date('2026-05-08T15:00:00Z')} />)
    expect(screen.getByText(/nothing right now/i)).toBeInTheDocument()
  })

  it('renders event title with countdown', () => {
    const event = { id: 'e1', title: 'Pickup' } as any
    const startTime = new Date('2026-05-08T15:15:00Z')
    render(<WallNowFocusCard
      imminent={{ kind: 'event', entity: event, startTime }}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText('Pickup')).toBeInTheDocument()
    expect(screen.getByText(/in 15 min/i)).toBeInTheDocument()
  })

  it('renders task title with countdown', () => {
    const task = createMockTask({
      id: 't1',
      title: 'Take out trash',
      scheduledFor: new Date('2026-05-08T15:10:00Z'),
    })
    render(<WallNowFocusCard
      imminent={{ kind: 'task', entity: task, startTime: task.scheduledFor as Date }}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText('Take out trash')).toBeInTheDocument()
    expect(screen.getByText(/in 10 min/i)).toBeInTheDocument()
  })

  it('renders location for events with location', () => {
    const event = { id: 'e1', title: 'Doctor', location: 'Park Ave' } as any
    render(<WallNowFocusCard
      imminent={{ kind: 'event', entity: event, startTime: new Date('2026-05-08T16:00:00Z') }}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText(/park ave/i)).toBeInTheDocument()
  })
})
