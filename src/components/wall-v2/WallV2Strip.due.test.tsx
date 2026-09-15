import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { WallV2Strip } from './WallV2Strip'

const base = {
  tonight: null, meals: [], comingUp: [], question: 'What made you laugh today?',
  onCall: () => {},
}

const row = (id: string, title: string, who: string | null = null) =>
  ({ id, title, who, completed: false })

describe("the strip's third cell — who gets it", () => {
  it("shows tonight's question when nothing is due", () => {
    render(<WallV2Strip {...base} due={[]} />)
    expect(screen.getByText(/What made you laugh/)).toBeInTheDocument()
    expect(screen.queryByText(/Due today/)).toBeNull()
  })

  it('shares the cell: what is due AND the question, never one silently replacing the other', () => {
    render(<WallV2Strip {...base} due={[row('a', 'Buy backyard bench', 'Iris')]} />)
    expect(screen.getByText('Buy backyard bench')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText(/What made you laugh/)).toBeInTheDocument()
  })

  it('draws two rows and lets the label carry the true count when more are due', () => {
    render(
      <WallV2Strip
        {...base}
        due={[row('a', 'Posters frame'), row('b', 'Send Guy access'), row('c', 'Third thing'), row('d', 'Fourth thing')]}
      />,
    )
    expect(screen.getByText('Due today · 4')).toBeInTheDocument()
    expect(screen.getByText('Posters frame')).toBeInTheDocument()
    expect(screen.getByText('Send Guy access')).toBeInTheDocument()
    // The cell cannot hold four rows and the question at eight feet; the rest
    // are reachable on Today, and the count says they exist.
    expect(screen.queryByText('Third thing')).toBeNull()
    expect(screen.getByText(/What made you laugh/)).toBeInTheDocument()
  })

  it('keeps the question tappable while it shares the cell', async () => {
    const onTapQuestion = vi.fn()
    render(<WallV2Strip {...base} due={[row('a', 'Posters frame')]} onTapQuestion={onTapQuestion} />)
    await userEvent.click(screen.getByRole('button', { name: /What made you laugh/ }))
    expect(onTapQuestion).toHaveBeenCalledOnce()
  })

  it('says so plainly when the question is done for tonight but work remains', () => {
    render(<WallV2Strip {...base} question={null} due={[row('a', 'Posters frame')]} />)
    expect(screen.getByText('Posters frame')).toBeInTheDocument()
    expect(screen.getByText('Done for tonight')).toBeInTheDocument()
  })

  it('a handoff nobody has claimed outranks both', () => {
    render(<WallV2Strip {...base} due={[row('a', 'Buy backyard bench')]}
      handoff={{ lead: 'Tomorrow · 7:15a', prompt: "Who's walking Ella & Kaleb to school?", more: 0 }} />)
    expect(screen.getByText(/Who's walking/)).toBeInTheDocument()
    expect(screen.queryByText('Buy backyard bench')).toBeNull()
  })
})
