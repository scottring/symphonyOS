import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelMightBeRelevant } from './PanelMightBeRelevant'

describe('PanelMightBeRelevant', () => {
  it('renders nothing when list is empty', () => {
    const { container } = render(<PanelMightBeRelevant items={[]} onOpen={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders items with reasons', () => {
    render(
      <PanelMightBeRelevant
        items={[
          { id: 't1', kind: 'task', title: 'Last call to Dr. Smith', reason: 'same contact' },
          { id: 't2', kind: 'task', title: 'Refill rx', reason: 'same person' },
        ]}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('Last call to Dr. Smith')).toBeInTheDocument()
    expect(screen.getByText(/same contact/i)).toBeInTheDocument()
  })

  it('calls onOpen with the item kind and id', async () => {
    const onOpen = vi.fn()
    const { user } = render(
      <PanelMightBeRelevant
        items={[{ id: 't1', kind: 'task', title: 'Some task', reason: 'r' }]}
        onOpen={onOpen}
      />
    )
    await user.click(screen.getByText('Some task'))
    expect(onOpen).toHaveBeenCalledWith('task', 't1')
  })
})
