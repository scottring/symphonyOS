import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { ContactViewRedesign } from './ContactViewRedesign'
import type { Contact } from '@/types/contact'

// Review 2026-09-22: a failed contact delete still left the contact page.
const contact = { id: 'c1', name: 'Dr. Patel', createdAt: new Date(), updatedAt: new Date() } as unknown as Contact

function renderView(onDelete: (id: string) => Promise<void | boolean>) {
  const onBack = vi.fn()
  render(
    <ContactViewRedesign contact={contact} onBack={onBack} onUpdate={vi.fn(async () => {})} onDelete={onDelete} tasks={[]} onSelectTask={vi.fn()} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete contact' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  return { onBack }
}

describe('ContactViewRedesign delete', () => {
  it('stays on the page (confirmation still open to retry) when the delete fails', async () => {
    const onDelete = vi.fn().mockResolvedValue(false)
    const { onBack } = renderView(onDelete)
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c1'))
    expect(onBack).not.toHaveBeenCalled()
    expect(screen.getByText('Delete this contact?')).toBeInTheDocument()
  })

  it('leaves the page once the delete succeeds', async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    const { onBack } = renderView(onDelete)
    await waitFor(() => expect(onBack).toHaveBeenCalled())
  })
})
