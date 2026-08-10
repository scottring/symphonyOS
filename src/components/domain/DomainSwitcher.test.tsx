import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DomainProvider } from '@/hooks/useDomain'
import { DomainSwitcher } from './DomainSwitcher'

function renderSwitcher() {
  return render(
    <DomainProvider>
      <DomainSwitcher />
    </DomainProvider>,
  )
}

describe('DomainSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the active domain on a single trigger, with the others hidden until asked for', () => {
    renderSwitcher()

    expect(screen.getByRole('button', { name: /domain: universal/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Work' })).not.toBeInTheDocument()
  })

  it('opens on click — no hover required — and switches the domain', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(screen.getByRole('button', { name: /domain: universal/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Work' }))

    expect(screen.getByRole('button', { name: /domain: work/i })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(localStorage.getItem('symphony-current-domain')).toBe('work')
  })

  // The bug this replaced: expanding in-flow widened the control 51px → 189px,
  // which re-wrapped the header row and yanked the control out from under the
  // cursor before a click could land. A portalled menu cannot move its trigger.
  it('renders the menu outside its own subtree so opening it never reflows the header', async () => {
    const user = userEvent.setup()
    const { container } = renderSwitcher()

    await user.click(screen.getByRole('button', { name: /domain: universal/i }))

    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(container.contains(menu)).toBe(false)
  })

  it('closes on Escape without changing the domain', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(screen.getByRole('button', { name: /domain: universal/i }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /domain: universal/i })).toBeInTheDocument()
  })
})
