import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallNowView } from './WallNowView'
import { createMockTask } from '@/test/mocks/factories'

describe('WallNowView', () => {
  const baseProps = {
    events: [],
    tasks: [],
    dinner: null as string | null,
    openListCount: 0,
    discussionCount: 0,
  }

  it('renders the focus card and rail', () => {
    render(<WallNowView {...baseProps} now={new Date('2026-05-08T15:00:00Z')} />)
    expect(screen.getByText(/nothing right now/i)).toBeInTheDocument()
    expect(screen.getByText(/lists/i)).toBeInTheDocument()
  })

  it('shows date/time header', () => {
    render(<WallNowView {...baseProps} now={new Date('2026-05-08T15:00:00Z')} />)
    expect(screen.getByText(/may 8|may.* 8|2026/i)).toBeInTheDocument()
  })

  it('focus card surfaces the most imminent task', () => {
    const task = createMockTask({
      id: 't1',
      title: 'Trash',
      scheduledFor: new Date('2026-05-08T15:10:00Z'),
    })
    render(<WallNowView
      {...baseProps}
      tasks={[task]}
      now={new Date('2026-05-08T15:00:00Z')}
    />)
    expect(screen.getByText('Trash')).toBeInTheDocument()
  })
})
