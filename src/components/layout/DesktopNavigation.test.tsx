import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DesktopNavigation } from './DesktopNavigation'

describe('DesktopNavigation — one bar on every page (2026-09-29)', () => {
  // Scott, 2026-10-03: the menu immediately left of the rail, in the centre.
  it('the menu just before the rail; Discussions and Inbox (counts, no words), search and the account at the right — no Add', () => {
    render(<MemoryRouter initialEntries={['/week']}>
      <DesktopNavigation inboxCount={3} discussionsUnread={1} onSearch={vi.fn()} onSignOut={vi.fn()} paused={false} controlsRef={() => {}} centerRef={() => {}} />
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
    expect(order).toEqual(['Discussions, 1 waiting on you', 'Inbox, 3 items', 'Search', 'Account'])
    // Scott, 2026-10-14: nowhere showed discussions waiting; now beside Inbox.
    const talk = within(right).getByRole('link', { name: 'Discussions, 1 waiting on you' })
    expect(talk.getAttribute('href')).toMatch(/^\/discussions\b/)
    expect(talk.textContent).toBe('1')
  })

  it('the app mark anchors the corner and goes Home (2026-10-11)', () => {
    render(<MemoryRouter initialEntries={['/week']}>
      <DesktopNavigation inboxCount={0} discussionsUnread={0} onSearch={vi.fn()} onSignOut={vi.fn()} paused={false} controlsRef={() => {}} />
    </MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const mark = within(nav).getByRole('link', { name: 'Symphony, go to Home' })
    expect(mark).toHaveAttribute('href', '/overview?workspace=1')
    expect(nav.querySelector('.page-navigation-left')?.firstElementChild).toBe(mark)
  })
})
