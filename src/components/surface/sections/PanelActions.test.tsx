import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelActions, MAX_VISIBLE_ACTIONS, type PanelAction } from './PanelActions'

const act = (id: string, over: Partial<PanelAction> = {}): PanelAction => ({
  id,
  label: id,
  onClick: vi.fn(),
  ...over,
})

describe('PanelActions', () => {
  it('renders actions in the given order', () => {
    render(<PanelActions actions={[act('Complete'), act('Call'), act('Schedule')]} />)
    const labels = screen.getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Complete', 'Call', 'Schedule'])
  })

  it('fires onClick', async () => {
    const onClick = vi.fn()
    render(<PanelActions actions={[act('Complete', { onClick })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders an href action as a link', () => {
    render(<PanelActions actions={[act('Call', { href: 'tel:5551234' })]} />)
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:5551234')
  })

  it('delegates a render action to its own node', () => {
    render(<PanelActions actions={[act('Schedule', { render: () => <button>Custom</button> })]} />)
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument()
  })

  it(`folds actions past ${MAX_VISIBLE_ACTIONS} into an overflow menu`, async () => {
    const user = userEvent.setup()
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => act(id))
    render(<PanelActions actions={many} />)

    expect(screen.getByRole('button', { name: 'e' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'f' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('button', { name: 'f' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'g' })).toBeInTheDocument()
  })

  it('fires a folded action from the overflow menu', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => act(id))
    render(<PanelActions actions={[...many, act('f', { onClick })]} />)

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('button', { name: 'f' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not show an overflow trigger when everything fits', () => {
    render(<PanelActions actions={[act('a'), act('b')]} />)
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument()
  })

  it('renders the supplied overflow node last', () => {
    render(<PanelActions actions={[act('Complete')]} overflow={<button>More</button>} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[buttons.length - 1]).toHaveTextContent('More')
  })

  it('renders a check on the completed state', () => {
    const { container } = render(
      <PanelActions actions={[act('Completed', { kind: 'completed' })]} />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
