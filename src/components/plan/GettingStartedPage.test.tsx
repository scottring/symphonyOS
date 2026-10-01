// Plan with guidance (/start): choose what to plan, then plan on the real
// pages with the guide bar (onboarding suite, 2026-09-29).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { GuideState, PickUpFacts } from '@/lib/guide/guidedPlan'
import type { PickUp } from '@/hooks/usePickUpFacts'

const guide = { state: null as GuideState | null, loaded: true, savedIn: 'account' as const, set: vi.fn(async () => {}) }
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => guide }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [] }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => undefined }) }))
vi.mock('@/lib/planFromPaperSignal', () => ({ requestPlanFromPaper: vi.fn(() => true) }))
vi.mock('@/contexts/GoalsContext', () => ({ GoalsProvider: ({ children }: { children: React.ReactNode }) => children }))
// What "pick up where you are" reads; the rows come from the real rules.
const pick = { current: null as PickUp | null }
vi.mock('@/hooks/usePickUpFacts', () => ({ usePickUpFacts: () => pick.current }))

import { GettingStartedPage } from './GettingStartedPage'
import { MORE_GROUPS } from '@/components/layout/moreDestinations'
import { requestPlanFromPaper } from '@/lib/planFromPaperSignal'
import { hasPlans, pickUpPeriods, pickUpRows } from '@/lib/guide/guidedPlan'
import type { Seasons } from '@/lib/cadence/seasons'

const seasons = [
  { name: 'Winter', month: 1, day: 1 }, { name: 'Spring', month: 4, day: 1 },
  { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
] as unknown as Seasons
const NONE: PickUpFacts = { yearGoals: 0, season: { open: 0, planned: false, review: 0 }, month: { open: 0, planned: false, review: 0 }, week: { open: 0, done: 0 }, todayChosen: 0 }
function reading(f: PickUpFacts, inbox = 0, at = new Date(2026, 9, 1, 10)): PickUp {
  const periods = pickUpPeriods(at, seasons, 6)
  return { loaded: true, offer: hasPlans(f), rows: pickUpRows(f, periods, at, seasons, () => 40), periods, inbox, seasons }
}

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p> }
const show = (at = '/start') => render(
  <MemoryRouter initialEntries={[at]}>
    <Routes><Route path="/start" element={<GettingStartedPage />} /><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>,
)

describe('Plan with guidance', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 10)); guide.state = null; guide.set.mockClear(); localStorage.clear(); pick.current = reading(NONE, 0, new Date(2026, 8, 29, 10)) })
  afterEach(() => vi.useRealTimers())

  it('a new account: four paths and a way out, no pick-up', () => {
    show()
    expect(screen.queryByText('Pick up where you are')).toBeNull()
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
    // Names both months (walkthrough: "this month is nearly over" read as October).
    expect(screen.getByText('September is nearly over, so October is the one to plan.')).toBeTruthy()
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

  describe('pick up where you are', () => {
    const storyboard: PickUpFacts = { yearGoals: 4, season: { open: 6, planned: false, review: 0 }, month: { open: 0, planned: false, review: 3 }, week: { open: 2, done: 0 }, todayChosen: 1 }
    beforeEach(() => { vi.setSystemTime(new Date(2026, 9, 1, 10)); pick.current = reading(storyboard, 12) })

    it('is offered first and chosen for an account with plans, with what each level holds', () => {
      show()
      const radio = screen.getByRole('radio', { name: /Pick up where you are/ }) as HTMLInputElement
      expect(radio.checked).toBe(true)
      expect(screen.getByText('12 captures in your Inbox aren’t sorted yet.')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Sort them first' })).toHaveAttribute('href', '/inbox')
      expect(screen.getByText('6 priorities')).toBeTruthy()
      expect(screen.getByText('3 lines still open')).toBeTruthy()
    })

    it('suggests only the steps that need attention, and any can be left out', async () => {
      show()
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
      expect(screen.getByRole('heading', { name: 'Here’s what needs you' })).toBeTruthy()
      expect(screen.getByText('Four steps.', { exact: false })).toBeTruthy()
      expect(screen.getByText(/Already in place, so no step is needed: 2026 \(4 goals\), Fall \(6 priorities\)/)).toBeTruthy()
      fireEvent.click(screen.getByRole('checkbox', { name: /Check week 40/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Start' }))
      await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/month?start=2026-10-01'))
      expect(guide.set).toHaveBeenCalledWith(expect.objectContaining({ route: 'pickup', steps: ['month-review', 'month', 'today'], status: 'active' }))
    })

    it('a finished catch-up says what the look-back left', () => {
      guide.state = { v: 1, route: 'pickup', steps: ['month-review', 'today'], periods: { 'month-review': '2026-10-01', today: '2026-10-01' }, current: 1, done: ['month-review', 'today'], status: 'finished', updatedAt: '' }
      show('/start?done=1')
      expect(screen.getByText('Look back at September')).toBeTruthy()
      expect(screen.getByText('Everything decided')).toBeTruthy()
    })
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
