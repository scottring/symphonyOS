import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DesktopNavigation } from './DesktopNavigation'

describe('DesktopNavigation — one bar on every page (2026-09-29)', () => {
  // Scott, 2026-10-03: the menu immediately left of the rail, in the centre.
  it('the menu just before the rail; Inbox (a count, no word), search and the account at the right — no Add', () => {
    render(<MemoryRouter initialEntries={['/week']}>
      <DesktopNavigation inboxCount={3} discussionsUnread={0} onSearch={vi.fn()} onSignOut={vi.fn()} paused={false} controlsRef={() => {}} centerRef={() => {}} />
    </MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const mid = nav.querySelector('.page-navigation-mid') as HTMLElement
    expect(mid).toContainElement(screen.getByRole('button', { name: 'More' }))
    expect(mid.lastElementChild?.className).toBe('page-navigation-center')
    expect(nav.querySelector('.page-navigation-left')).not.toContainElement(screen.getByRole('button', { name: 'More' }))
    const right = nav.querySelector('.page-navigation-utilities') as HTMLElement
    const inbox = within(right).getByRole('link', { name: 'Inbox, 3 items' })
    expect(inbox.textContent).toBe('3')
    const order = [...right.querySelectorAll('a, button')].map((el) => el.getAttribute('aria-label') ?? el.textContent)
    expect(order).toEqual(['Inbox, 3 items', 'Search', 'Account'])
  })

  it('the app mark anchors the corner and goes to Today (2026-10-02)', () => {
    render(<MemoryRouter initialEntries={['/week']}>
      <DesktopNavigation inboxCount={0} discussionsUnread={0} onSearch={vi.fn()} onSignOut={vi.fn()} paused={false} controlsRef={() => {}} />
    </MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const mark = within(nav).getByRole('link', { name: 'Symphony, go to Today' })
    expect(mark).toHaveAttribute('href', '/today')
    expect(nav.querySelector('.page-navigation-left')?.firstElementChild).toBe(mark)
  })
})
