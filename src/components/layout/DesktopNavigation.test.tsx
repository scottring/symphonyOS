import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DesktopNavigation } from './DesktopNavigation'

describe('DesktopNavigation — one bar on every page (2026-09-29)', () => {
  it('the menu at the left; Inbox (a count, no word), search and the account at the right — no Add', () => {
    render(<MemoryRouter initialEntries={['/week']}>
      <DesktopNavigation inboxCount={3} discussionsUnread={0} onSearch={vi.fn()} onSignOut={vi.fn()} paused={false} controlsRef={() => {}} />
    </MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav.firstElementChild).toContainElement(screen.getByRole('button', { name: 'More' }))
    const right = nav.querySelector('.page-navigation-utilities') as HTMLElement
    const inbox = within(right).getByRole('link', { name: 'Inbox, 3 items' })
    expect(inbox.textContent).toBe('3')
    const order = [...right.querySelectorAll('a, button')].map((el) => el.getAttribute('aria-label') ?? el.textContent)
    expect(order).toEqual(['Inbox, 3 items', 'Search', 'Account'])
  })
})
