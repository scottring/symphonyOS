import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapEventPanel } from './TapEventPanel'
import { createMockTask } from '@/test/mocks/factories'

const baseHandlers = {
  onClose: vi.fn(),
  onNotesChange: vi.fn(),
  onAddPrepTask: vi.fn(),
  onMore: vi.fn(),
  onAddLink: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenRelated: vi.fn(),
}

const mockEvent = {
  id: 'e1',
  title: 'Annual physical',
  start_time: '2026-05-14T09:00:00Z',
  end_time: '2026-05-14T09:30:00Z',
  location: 'Park Ave Pediatrics',
} as any

describe('TapEventPanel', () => {
  it('renders event title in header', () => {
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Annual physical')).toBeInTheDocument()
  })

  it('renders prep tasks linked to the event', () => {
    const prep = createMockTask({ id: 't1', linkedEventId: 'e1', title: 'Bring vaccine card' })
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[prep]} {...baseHandlers}
    />)
    expect(screen.getByText('Bring vaccine card')).toBeInTheDocument()
  })

  it('uses "What to bring" label for notes', () => {
    render(<TapEventPanel
      event={mockEvent} notes="Insurance card" allTasks={[]} {...baseHandlers}
    />)
    expect(screen.getByText(/what to bring/i)).toBeInTheDocument()
  })
})
