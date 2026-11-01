import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'

const wall = vi.hoisted(() => ({
  add: vi.fn(async (..._a: unknown[]) => true),
  me: vi.fn(async (_u: string) => 'member-scott' as string | null),
}))
vi.mock('@/lib/wall/addScratchpadNote', () => ({ addScratchpadNote: wall.add, ownMemberId: wall.me }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

import { TellFamily } from './TellFamily'

const weekStart = new Date(2026, 10, 1) // Sunday Nov 1
const nextWeek = new Date(2026, 10, 8)

function Held(props: Partial<React.ComponentProps<typeof TellFamily>>) {
  const [draft, setDraft] = useState<string | null>(null)
  return <TellFamily weekStart={weekStart} familyItems={[]} draft={draft} onDraft={setDraft} {...props} />
}
const box = () => screen.getByLabelText('What should the family know?')

beforeEach(() => {
  wall.add.mockReset(); wall.add.mockImplementation(async () => true)
  wall.me.mockClear()
})

describe('TellFamily — step 7, the wall for the week', () => {
  it('starts empty: nothing is written for Scott', () => {
    render(<Held />)
    expect(box()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Post to the wall' })).toBeDisabled()
  })

  it('posts one note per non-empty line, exactly as typed, until the week ends', async () => {
    render(<Held />)
    fireEvent.change(box(), { target: { value: 'Grandma visits Thursday\n\n  Swim moved to 5:30  \n' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' })) })
    expect(wall.me).toHaveBeenCalledWith('me')
    expect(wall.add.mock.calls).toEqual([
      ['me', 'Grandma visits Thursday', 'note', 'member-scott', nextWeek],
      ['me', 'Swim moved to 5:30', 'note', 'member-scott', nextWeek],
    ])
    expect(screen.getByRole('status')).toHaveTextContent('Posted 2 notes')
    expect(box()).toHaveValue('')
  })

  it('a line that did not post stays in the box to try again; the rest are not posted twice', async () => {
    wall.add.mockImplementation(async (...a: unknown[]) => a[1] !== 'Swim moved')
    render(<Held />)
    fireEvent.change(box(), { target: { value: 'Grandma visits\nSwim moved' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Posted 1 note. 1 didn’t post. Try again.')
    expect(box()).toHaveValue('Swim moved')
  })

  it('shows the week’s Family items for reference, without putting them in the box', () => {
    render(<Held familyItems={[{ id: 'a', title: 'Fix the gate' }, { id: 'b', title: 'Book the vet' }]} />)
    expect(screen.getByRole('list', { name: 'This week’s Family items' })).toHaveTextContent('Fix the gateBook the vet')
    expect(box()).toHaveValue('')
  })
})
