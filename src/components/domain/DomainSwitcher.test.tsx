import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DomainProvider, LAYERS_KEY } from '@/hooks/useDomain'
import { DomainSwitcher } from './DomainSwitcher'

function renderSwitcher() {
  return render(<DomainProvider><DomainSwitcher /></DomainProvider>)
}

describe('DomainSwitcher', () => {
  beforeEach(() => localStorage.clear())

  it('starts with every layer on and the menu closed', () => {
    renderSwitcher()
    expect(screen.getByRole('button', { name: 'Layers: All' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('unchecking a layer keeps the menu open and persists the set', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Work' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Work' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!).sort()).toEqual(['family', 'personal', 'unsorted'])
    expect(screen.getByRole('button', { name: 'Layers: Family, Personal, Unsorted' })).toBeInTheDocument()
  })

  it('"Only" narrows to one layer and "All" restores everything', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.click(screen.getByRole('button', { name: 'Only Family' }))
    expect(screen.getByRole('button', { name: 'Layers: Family' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: 'Layers: All' })).toBeInTheDocument()
  })

  it('the last checked layer cannot be unchecked', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.click(screen.getByRole('button', { name: 'Only Work' }))
    const work = screen.getByRole('menuitemcheckbox', { name: 'Work' })
    expect(work).toBeDisabled()
  })

  // The bug this component replaced: expanding in-flow re-wrapped the header
  // and yanked the control out from under the cursor. A portalled menu can't.
  it('renders the menu outside its own subtree', async () => {
    const user = userEvent.setup()
    const { container } = renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    expect(container.contains(screen.getByRole('menu'))).toBe(false)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(screen.getByRole('button', { name: 'Layers: All' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
