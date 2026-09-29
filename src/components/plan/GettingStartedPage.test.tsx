// Plan with guidance (/start): choose what to plan, then plan on the real
// pages with the guide bar (onboarding suite, 2026-09-29).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { GuideState } from '@/lib/guide/guidedPlan'

const guide = { state: null as GuideState | null, loaded: true, savedIn: 'account' as const, set: vi.fn(async () => {}) }
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => guide }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [] }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => undefined }) }))
vi.mock('@/lib/planFromPaperSignal', () => ({ requestPlanFromPaper: vi.fn(() => true) }))

import { GettingStartedPage } from './GettingStartedPage'
import { MORE_GROUPS } from '@/components/layout/moreDestinations'
import { requestPlanFromPaper } from '@/lib/planFromPaperSignal'

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p> }
const show = (at = '/start') => render(
  <MemoryRouter initialEntries={[at]}>
    <Routes><Route path="/start" element={<GettingStartedPage />} /><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>,
)

describe('Plan with guidance', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 10)); guide.state = null; guide.set.mockClear(); localStorage.clear() })
  afterEach(() => vi.useRealTimers())

  it('asks what to plan, with four paths and a way out', () => {
    show()
    expect(screen.getByRole('heading', { name: 'What would you like to plan?' })).toBeTruthy()
    for (const name of ['The bigger picture', 'The month ahead', 'This week', 'Just today']) expect(screen.getByText(name)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Explore on my own' }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })

  it('month ahead on Sep 29 recommends October, then starts on October’s page', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const october = screen.getByRole('radio', { name: /October 2026/ }) as HTMLInputElement
    expect(october.checked).toBe(true)
    expect(screen.getByRole('radio', { name: /September 2026/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start planning' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/month?start=2026-10-01'))
    expect(guide.set).toHaveBeenCalledWith(expect.objectContaining({ route: 'month', steps: ['month', 'week', 'today'], status: 'active' }))
  })

  it('can start from a paper plan', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Photograph a paper plan first' }))
    await waitFor(() => expect(requestPlanFromPaper).toHaveBeenCalled())
  })

  it('offers Resume for a paused run', () => {
    guide.state = { v: 1, route: 'week', steps: ['week', 'today'], periods: { week: '2026-09-26', today: '2026-09-29' }, current: 1, done: ['week'], status: 'paused', updatedAt: '' }
    show()
    expect(screen.getByText(/partway through/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })

  it('a finished run says what is ready and opens Today', () => {
    guide.state = { v: 1, route: 'today', steps: ['today'], periods: { today: '2026-09-29' }, current: 0, done: ['today'], status: 'finished', updatedAt: '' }
    show('/start?done=1')
    expect(screen.getByRole('heading', { name: 'Your plan is ready' })).toBeTruthy()
    expect(screen.getByText('Nothing chosen yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Today' }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })

  it('links to the planning guide', () => {
    show()
    expect(screen.getByRole('link', { name: /Open the planning guide/ })).toHaveAttribute('href', '/guide')
  })

  it('is where More → Plan with guidance goes', () => {
    const entry = MORE_GROUPS.flatMap(([, items]) => items).find((d) => d.label === 'Plan with guidance')
    expect(entry?.route).toBe('/start')
  })
})
