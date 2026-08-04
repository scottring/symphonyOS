import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelPeople } from './PanelPeople'
import { createMockContact, createMockFamilyMember } from '@/test/mocks/factories'

// AssignPicker (rendered only when onContactChange is provided) depends on Google Places.
vi.mock('@/hooks/useGooglePlaces', () => ({
  useGooglePlaces: () => ({
    results: [],
    loading: false,
    searchPlaces: vi.fn(),
    getPlaceDetails: vi.fn(),
    clearResults: vi.fn(),
  }),
}))

describe('PanelPeople', () => {
  it('renders nothing when no people present', () => {
    const { container } = render(<PanelPeople onOpenContact={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders contact name and phone', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    render(<PanelPeople contact={contact} onOpenContact={vi.fn()} />)
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
    expect(screen.getByText(/555-0107/)).toBeInTheDocument()
  })

  it('does not render the assignee — that is who DOES it, and the panel already shows them as chips', () => {
    // The old row read "Liam — for whom", which inverted the data model
    // (contactId is the "about" link) and duplicated the assignee chips at the
    // top of the panel, which read the current multi-assignee field.
    const m = createMockFamilyMember({ id: 'm1', name: 'Liam' })
    const { container } = render(
      <PanelPeople onOpenContact={vi.fn()} {...({ assignee: m } as Record<string, never>)} />
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Liam')).not.toBeInTheDocument()
  })

  it('calls onOpenContact when contact is clicked', async () => {
    const onOpenContact = vi.fn()
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
    const { user } = render(<PanelPeople contact={contact} onOpenContact={onOpenContact} />)
    await user.click(screen.getByRole('button', { name: /Dr. Smith/ }))
    expect(onOpenContact).toHaveBeenCalledWith('c1')
  })

  it('renders the picker but no "empty" placeholder when editable with no contact linked', () => {
    // A line announcing the section is empty is the section doing nothing at
    // full size. The panel's Add row covers the empty case now.
    render(
      <PanelPeople onOpenContact={vi.fn()} contacts={[]} onContactChange={vi.fn()} />
    )
    expect(screen.queryByText('No related contact')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Assign to')).toBeInTheDocument()
  })

  it('selecting a contact from the picker calls onContactChange', async () => {
    const onContactChange = vi.fn()
    const contacts = [createMockContact({ id: 'c2', name: 'Evan Ross' })]
    const { user } = render(
      <PanelPeople onOpenContact={vi.fn()} contacts={contacts} onContactChange={onContactChange} />
    )
    await user.click(screen.getByLabelText('Assign to'))
    await user.click(screen.getByText('Evan Ross'))
    expect(onContactChange).toHaveBeenCalledWith('c2')
  })
})
