import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

// Tell the family's home on the Week page (planning as tooltips, Task 2): a
// quiet "For the family this week" line, every day. What is written goes on
// the wall, one note per line, until the week is over.
const wall = vi.hoisted(() => ({ add: vi.fn(async () => true), member: vi.fn(async () => 'm1'), del: vi.fn(async () => true) }))
vi.mock('@/lib/wall/addScratchpadNote', () => ({ addScratchpadNote: wall.add, ownMemberId: wall.member, deleteScratchpadNote: wall.del }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

import { FamilyWeekLine } from './FamilyWeekLine'

const weekStart = new Date(2026, 9, 31)
const write = async (text: string) => {
  const line = screen.getByRole('textbox', { name: 'What should the family know this week?' })
  fireEvent.change(line, { target: { value: text } })
  await act(async () => { fireEvent.submit(line.closest('form')!) })
  return line
}

beforeEach(() => { wall.add.mockReset(); wall.add.mockResolvedValue(true); wall.del.mockReset(); wall.del.mockResolvedValue(true) })

describe('For the family this week', () => {
  it('is a quiet section of the week, the family step’s anchor', () => {
    render(<FamilyWeekLine weekStart={weekStart} />)
    const section = screen.getByRole('region', { name: 'For the family this week' })
    expect(section).toHaveAttribute('data-guide-anchor', 'family')
    expect(within(section).getByRole('textbox', { name: 'What should the family know this week?' })).toHaveValue('')
  })

  it('a line written goes on the wall until the week is over, and is listed under it', async () => {
    render(<FamilyWeekLine weekStart={weekStart} />)
    const line = await write('  Grandma visits Saturday ')
    expect(wall.add).toHaveBeenCalledWith('me', 'Grandma visits Saturday', 'note', 'm1', new Date(2026, 10, 7), expect.any(String))
    expect(line).toHaveValue('')
    expect(within(screen.getByRole('list', { name: 'On the wall this week' })).getByText('Grandma visits Saturday')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('On the wall until the week is over.')
  })

  // Final review: two Returns before the first post lands put it up once.
  it('a double Return posts the line once', async () => {
    let land: (ok: boolean) => void = () => {}
    wall.add.mockImplementation(() => new Promise<boolean>((r) => { land = r }))
    render(<FamilyWeekLine weekStart={weekStart} />)
    const line = screen.getByRole('textbox', { name: 'What should the family know this week?' })
    fireEvent.change(line, { target: { value: 'Grandma visits Saturday' } })
    const form = line.closest('form')!
    // Both land before React renders again (one batch), as two quick taps can.
    act(() => { form.requestSubmit(); form.requestSubmit() })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(wall.add).toHaveBeenCalledTimes(1)
    await act(async () => { land(true) })
    expect(within(screen.getByRole('list', { name: 'On the wall this week' })).getAllByText('Grandma visits Saturday')).toHaveLength(1)
  })

  it('a note that did not post says so and keeps the words', async () => {
    wall.add.mockResolvedValue(false)
    render(<FamilyWeekLine weekStart={weekStart} />)
    const line = await write('Dentist Tuesday')
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t post. Try again.')
    expect(line).toHaveValue('Dentist Tuesday')
    expect(screen.queryByRole('list', { name: 'On the wall this week' })).toBeNull()
  })

  it('a line too long for the wall waits rather than being cut', async () => {
    render(<FamilyWeekLine weekStart={weekStart} />)
    await write('x'.repeat(501))
    expect(wall.add).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Over 500 characters')
  })

  // Fix round 1: a note just posted can be taken back.
  it('Undo takes a posted note off the wall again', async () => {
    render(<FamilyWeekLine weekStart={weekStart} />)
    await write('Grandma visits Saturday')
    const id = (wall.add.mock.calls[0] as unknown[])[5]
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo: Grandma visits Saturday' })) })
    expect(wall.del).toHaveBeenCalledWith(id)
    expect(screen.queryByRole('list', { name: 'On the wall this week' })).toBeNull()
  })
  it('an Undo that did not go through says so and keeps the line', async () => {
    wall.del.mockResolvedValue(false)
    render(<FamilyWeekLine weekStart={weekStart} />)
    await write('Grandma visits Saturday')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo: Grandma visits Saturday' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t take it back. Try again.')
    expect(within(screen.getByRole('list', { name: 'On the wall this week' })).getByText('Grandma visits Saturday')).toBeInTheDocument()
  })
})
