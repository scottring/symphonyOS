import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallV2Strip } from './WallV2Strip'

const base = {
  tonight: null, meals: [], comingUp: [], question: 'What made you laugh today?',
  onCall: () => {},
}

describe("the strip's third cell — who gets it", () => {
  it("shows tonight's question when nothing is due", () => {
    render(<WallV2Strip {...base} due={[]} />)
    expect(screen.getByText(/What made you laugh/)).toBeInTheDocument()
    expect(screen.queryByText(/Due today/)).toBeNull()
  })
  it('shows what is due instead of the question when there is something to do', () => {
    render(<WallV2Strip {...base} due={[{ id: 'a', title: 'Buy backyard bench', who: 'Iris', completed: false }]} />)
    expect(screen.getByText('Buy backyard bench')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.queryByText(/What made you laugh/)).toBeNull()
  })
  it('a handoff nobody has claimed outranks both', () => {
    render(<WallV2Strip {...base} due={[{ id: 'a', title: 'Buy backyard bench', who: null, completed: false }]}
      handoff={{ lead: 'Tomorrow · 7:15a', prompt: "Who's walking Ella & Kaleb to school?", more: 0 }} />)
    expect(screen.getByText(/Who's walking/)).toBeInTheDocument()
    expect(screen.queryByText('Buy backyard bench')).toBeNull()
  })
})
