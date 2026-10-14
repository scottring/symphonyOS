import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const session = { saved: null as null | { authorId: string; at: Date }, mine: null, loading: false, loadedToken: '', error: null as null | string, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-9-27' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))

import { WeekV2 } from './WeekV2'
import { PlanMastheadSlotsContext } from './planMastheadSlots'

// A fixed Tuesday: the week's own last day changes what the toolbar offers,
// so these tests must not ride the wall clock.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 12)) })
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const renderWeek = (props: Partial<React.ComponentProps<typeof WeekV2>> = {}) => render(
  <MemoryRouter>
    <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent {...props} />
  </MemoryRouter>,
)

// 2026-10-14: the eight-step session is retired. Planning is a conversation,
// started from the bar (or, on phones, the page's own entry).
describe('WeekV2 toolbar — no session', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; session.save.mockReset() })

  it('has no Plan the week session button and no steps; an unplanned week can be marked planned', () => {
    renderWeek()
    expect(screen.getByText(/Week \d+ isn’t planned yet/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Plan the week' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Planning week/ })).toBeNull()
    expect(screen.queryByText(/Step \d of 8/)).toBeNull()
    expect(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }).className).toBe('pv2-btn')
  })

  it('marking planned leaves its own line with the next step — Today for this week', async () => {
    session.save.mockResolvedValue(true)
    renderWeek()
    fireEvent.click(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }))
    expect(await screen.findByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(screen.getByText(/Week \d+ is planned\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pick something for today →' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull()
  })

  it('a week planned ahead hands back to Today, not a dead end (#23)', async () => {
    session.save.mockResolvedValue(true)
    renderWeek({ weekStart: new Date(2026, 9, 3), isCurrent: false })
    fireEvent.click(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }))
    expect(await screen.findByRole('button', { name: 'Back to Today →' })).toBeTruthy()
  })

  it('a failed save says so and leaves the week unmarked', async () => {
    session.save.mockResolvedValue(false)
    renderWeek()
    fireEvent.click(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }))
    await vi.waitFor(() => expect(session.save).toHaveBeenCalled())
    expect(screen.queryByText(/is planned\./)).toBeNull()
  })

  it('a planned week says so, with no change-the-plan button', () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 27) }
    renderWeek()
    expect(screen.getByText(/planned/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Change the plan' })).toBeNull()
  })
})

describe('WeekV2 — the walk and the last day', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })

  it('draws the canvas, and the page entry only when it is given (phones)', () => {
    const start = vi.fn()
    const { rerender } = renderWeek({ canvas: <section aria-label="The days">canvas</section> })
    expect(screen.getByRole('region', { name: 'The days' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Plan the rest of my week' })).toBeNull()
    rerender(<MemoryRouter><WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent canvas={<p>c</p>} walk={{ label: 'Plan the rest of my week', onStart: start }} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Plan the rest of my week' }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('on its last day the nudge stays, with no session button; it points at the bar or the page entry', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 12))
    const { rerender } = renderWeek()
    expect(screen.getByText(/ends today/)).toBeTruthy()
    expect(screen.getByText(/talk it through in the bar/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Plan week/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Mark week/ })).toBeNull()
    rerender(<MemoryRouter><WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent walk={{ label: 'Plan the rest of my week', onStart: vi.fn() }} /></MemoryRouter>)
    expect(screen.getByText(/tap “Plan the rest of my week” below/)).toBeTruthy()
  })
})

// Layout system 2026-10-01: on desktop the control row folds into the week's
// masthead (HomeHeader's hosts); without hosts (phones) the row stays.
describe('WeekV2 toolbar — folded into the masthead', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })
  it('portals the status and the controls into the masthead hosts, with no row of its own', () => {
    const subline = document.createElement('div')
    const controls = document.createElement('div')
    document.body.append(subline, controls)
    const { container } = render(
      <MemoryRouter>
        <PlanMastheadSlotsContext.Provider value={{ subline, controls }}>
          <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent />
        </PlanMastheadSlotsContext.Provider>
      </MemoryRouter>,
    )
    expect(container.querySelector('.pv2-toolbar')).toBeNull()
    expect(subline.textContent).toMatch(/Week \d+ isn’t planned yet/)
    expect(within(controls).queryByRole('button', { name: 'Plan the week' })).toBeNull()
    expect(within(controls).queryByRole('group', { name: 'View' })).toBeNull()
    subline.remove(); controls.remove()
  })
})
