import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelPeople } from './PanelPeople'
import { createMockContact, createMockFamilyMember } from '@/test/mocks/factories'

describe('PanelPeople', () => {
  it('renders nothing when no people present', () => {
    const { container } = render(<PanelPeople onOpenContact={vi.fn()} onOpenMember={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders contact name and phone', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    render(<PanelPeople contact={contact} onOpenContact={vi.fn()} onOpenMember={vi.fn()} />)
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
    expect(screen.getByText(/555-0107/)).toBeInTheDocument()
  })

  it('renders assignee name', () => {
    const m = createMockFamilyMember({ id: 'm1', name: 'Liam' })
    render(<PanelPeople assignee={m} onOpenContact={vi.fn()} onOpenMember={vi.fn()} />)
    expect(screen.getByText('Liam')).toBeInTheDocument()
  })

  it('calls onOpenContact when contact is clicked', async () => {
    const onOpenContact = vi.fn()
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
    const { user } = render(<PanelPeople contact={contact} onOpenContact={onOpenContact} onOpenMember={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Dr. Smith/ }))
    expect(onOpenContact).toHaveBeenCalledWith('c1')
  })
})
