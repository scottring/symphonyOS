import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { WallV2ScratchpadSheet } from './WallV2ScratchpadSheet'
import type { FamilyMember } from '@/types/family'
import type { ScratchpadNote, ScratchpadRow } from '@/lib/wall/scratchpad'

const members = [
  { id: 'sk', name: 'Scott', initials: 'SK' },
  { id: 'ir', name: 'Iris', initials: 'IR' },
  { id: 'ka', name: 'Kaleb', initials: 'KA' },
] as unknown as FamilyMember[]
const now = new Date(2026, 9, 7, 16, 10)

const talk: ScratchpadRow = { key: 'note:t', source: 'note', id: 't', text: 'Fence quote, $4,200', kind: 'talk', authorMemberId: 'sk', createdAt: new Date(2026, 9, 6, 9), detail: null }
const plain: ScratchpadRow = { key: 'note:p', source: 'note', id: 'p', text: 'Out of AA batteries', kind: 'note', authorMemberId: 'ka', createdAt: new Date(2026, 9, 7, 8), detail: null }
const flagged: ScratchpadRow = { key: 'event:e', source: 'event', id: 'e', text: 'Thanksgiving travel', kind: 'talk', authorMemberId: null, createdAt: null, detail: null }
const sent: ScratchpadNote = { id: 's', body: 'Renew library cards', kind: 'note', authorMemberId: null, status: 'sent', resolution: null, sentToMemberId: 'ir', createdAt: new Date(2026, 9, 5), resolvedAt: new Date(2026, 9, 6) }
const done: ScratchpadNote = { ...sent, id: 'd', body: 'Halloween costumes', status: 'done', resolution: 'Knight and fox', sentToMemberId: null }

const setup = (o: Partial<Parameters<typeof WallV2ScratchpadSheet>[0]> = {}) => {
  const props = {
    rows: [talk, plain, flagged], sorted: [sent, done], members, inboxPeople: members.slice(0, 2), now, focusKey: null,
    onAdd: vi.fn(async () => true), onDone: vi.fn(), onSendToInbox: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
    onReopen: vi.fn(), onClose: vi.fn(), ...o,
  }
  render(<WallV2ScratchpadSheet {...props} />)
  return props
}
const rowOf = (text: string) => screen.getByText(text).closest('[data-key]') as HTMLElement

describe('WallV2ScratchpadSheet', () => {
  it('jots a talk-about from Kaleb with Enter, then clears for the next person', async () => {
    const p = setup()
    const input = screen.getByRole('textbox', { name: 'New note' })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Ella’s sleepover Saturday?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Talk about' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kaleb' }))
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(p.onAdd).toHaveBeenCalledWith('Ella’s sleepover Saturday?', 'talk', 'ka'))
    await waitFor(() => expect(input).toHaveValue(''))
    expect(screen.getByRole('button', { name: 'Kaleb' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a plain note is done in one tap; a talk-about asks what was decided', () => {
    const p = setup()
    fireEvent.click(within(rowOf('Out of AA batteries')).getByRole('button', { name: 'Done' }))
    expect(p.onDone).toHaveBeenCalledWith(plain, '')
    fireEvent.click(within(rowOf('Fence quote, $4,200')).getByRole('button', { name: 'Done' }))
    expect(p.onDone).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole('textbox', { name: 'What did we decide?' }), { target: { value: 'Get a second quote' } })
    fireEvent.click(within(rowOf('Fence quote, $4,200')).getAllByRole('button', { name: 'Done' })[1])
    expect(p.onDone).toHaveBeenLastCalledWith(talk, 'Get a second quote')
  })

  it('sends a note to Iris’s Inbox', () => {
    const p = setup()
    fireEvent.click(within(rowOf('Out of AA batteries')).getByRole('button', { name: 'To Inbox' }))
    fireEvent.click(within(rowOf('Out of AA batteries')).getByRole('button', { name: 'Iris' }))
    expect(p.onSendToInbox).toHaveBeenCalledWith(plain, 'ir')
  })

  it('something brought up in the app is only marked discussed', () => {
    const p = setup()
    const row = within(rowOf('Thanksgiving travel'))
    expect(row.getByText('Brought up from the calendar')).toBeInTheDocument()
    expect(row.queryByRole('button', { name: 'To Inbox' })).toBeNull()
    fireEvent.click(row.getByRole('button', { name: 'Discussed' }))
    expect(p.onDone).toHaveBeenCalledWith(flagged, '')
  })

  it('delete takes two taps', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'More for Out of AA batteries' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(p.onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }))
    expect(p.onDelete).toHaveBeenCalledWith(plain)
  })

  it('done this week says where each went, and a done note can be reopened', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: /Done this week \(2\)/ }))
    expect(screen.getByText('To Iris’s Inbox')).toBeInTheDocument()
    expect(screen.getByText('Decided: Knight and fox')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Reopen' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(p.onReopen).toHaveBeenCalledWith('d')
  })

  it('opened from a note on the face, that note is ringed', () => {
    setup({ focusKey: 'note:p' })
    expect(rowOf('Out of AA batteries')).toHaveClass('ring-2')
  })
})
