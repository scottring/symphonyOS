import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapContactPanel } from './TapContactPanel'
import { createMockContact, createMockTask } from '@/test/mocks/factories'

const baseHandlers = {
  onClose: vi.fn(),
  onNotesChange: vi.fn(),
  onMore: vi.fn(),
  onAddLink: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenEvent: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenRelated: vi.fn(),
}

describe('TapContactPanel', () => {
  it('renders contact name in header', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    render(<TapContactPanel
      contact={contact} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
  })

  it('renders Call link when phone present', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    render(<TapContactPanel
      contact={contact} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    const call = screen.getByRole('link', { name: /555-0107/ })
    expect(call).toHaveAttribute('href', 'tel:555-0107')
  })

  it('renders linked tasks under "Open with them"', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
    const t1 = createMockTask({ id: 't1', contactId: 'c1', title: 'Call about ear' })
    render(<TapContactPanel
      contact={contact} allTasks={[t1]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Call about ear')).toBeInTheDocument()
    expect(screen.getByText(/open with them/i)).toBeInTheDocument()
  })

  it('does not render "Open with them" when no linked entities', () => {
    const contact = createMockContact({ id: 'c1', name: 'Lone Wolf' })
    render(<TapContactPanel
      contact={contact} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.queryByText(/open with them/i)).not.toBeInTheDocument()
  })
})
