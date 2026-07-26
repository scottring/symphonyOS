import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Proposal } from '@/lib/today/proposeOrder'
import { ProposalPreview, ProposalTrigger } from './ProposalPreview'

const proposal: Proposal = {
  groups: [
    { key: 'project:p1', name: 'Yardwork', itemIds: ['task-1', 'task-3'], reason: '2 items already belong to Yardwork.' },
    { key: 'location:store', name: 'The store', itemIds: ['task-4', 'task-5'], reason: '2 items are all at The store — one trip.' },
  ],
  order: { itemIds: ['task-1', 'task-3', 'task-2'], reason: 'Things that go together are moved next to each other; nothing else moves.' },
}

const titles: Record<string, string> = {
  'task-1': 'Weed', 'task-2': 'Buy milk', 'task-3': 'Mow', 'task-4': 'Return sweater', 'task-5': 'Pick up order',
}

function setup(p: Proposal = proposal) {
  const onAcceptGroup = vi.fn()
  const onAcceptOrder = vi.fn()
  const onAcceptAll = vi.fn()
  const onClose = vi.fn()
  render(
    <ProposalPreview
      proposal={p}
      titleOf={(id) => titles[id] ?? id}
      onClose={onClose}
      onAcceptGroup={onAcceptGroup}
      onAcceptOrder={onAcceptOrder}
      onAcceptAll={onAcceptAll}
    />
  )
  return { onAcceptGroup, onAcceptOrder, onAcceptAll, onClose }
}

describe('ProposalPreview', () => {
  it('shows every suggestion with the reason it was made', () => {
    setup()
    expect(screen.getByText(/group “yardwork”/i)).toBeInTheDocument()
    expect(screen.getByText(/already belong to Yardwork/i)).toBeInTheDocument()
    expect(screen.getByText(/one trip/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing else moves/i)).toBeInTheDocument()
  })

  it('names the actual items, so the suggestion can be evaluated', () => {
    setup()
    expect(screen.getAllByText('· Weed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('· Buy milk').length).toBeGreaterThan(0)
  })

  it('accepts ONE group without touching the rest — partial acceptance', () => {
    return (async () => {
      const user = userEvent.setup()
      const { onAcceptGroup, onAcceptOrder, onAcceptAll } = setup()
      await user.click(screen.getAllByRole('button', { name: /make this group/i })[0])
      expect(onAcceptGroup).toHaveBeenCalledWith('project:p1')
      expect(onAcceptOrder).not.toHaveBeenCalled()
      expect(onAcceptAll).not.toHaveBeenCalled()
      // The taken one leaves; the other stays offered.
      expect(screen.queryByText(/group “yardwork”/i)).not.toBeInTheDocument()
      expect(screen.getByText(/group “the store”/i)).toBeInTheDocument()
    })()
  })

  it('accepts the order on its own', async () => {
    const user = userEvent.setup()
    const { onAcceptOrder, onAcceptGroup } = setup()
    await user.click(screen.getByRole('button', { name: /use this order/i }))
    expect(onAcceptOrder).toHaveBeenCalled()
    expect(onAcceptGroup).not.toHaveBeenCalled()
  })

  it('"Take all of it" applies everything and empties the preview', async () => {
    const user = userEvent.setup()
    const { onAcceptAll } = setup()
    await user.click(screen.getByRole('button', { name: /take all of it/i }))
    expect(onAcceptAll).toHaveBeenCalled()
    expect(screen.getByText(/nothing left to take/i)).toBeInTheDocument()
  })

  it('"Discard" applies nothing at all', async () => {
    const user = userEvent.setup()
    const { onClose, onAcceptAll, onAcceptGroup, onAcceptOrder } = setup()
    await user.click(screen.getByRole('button', { name: /discard/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onAcceptAll).not.toHaveBeenCalled()
    expect(onAcceptGroup).not.toHaveBeenCalled()
    expect(onAcceptOrder).not.toHaveBeenCalled()
  })

  it('says so plainly when a proposal is empty', () => {
    setup({ groups: [], order: null })
    expect(screen.getByText(/nothing left to take/i)).toBeInTheDocument()
  })
})

describe('ProposalTrigger', () => {
  it('renders nothing when the proposer found no signal', () => {
    // Silence is the honest answer, not a gap to fill.
    const { container } = render(<ProposalTrigger count={0} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('pluralises its count', () => {
    const { rerender } = render(<ProposalTrigger count={1} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /1 suggestion$/i })).toBeInTheDocument()
    rerender(<ProposalTrigger count={3} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /3 suggestions/i })).toBeInTheDocument()
  })
})
