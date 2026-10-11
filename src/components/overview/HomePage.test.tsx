import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { HomeBearings } from '@/hooks/useHomeBearings'
import type { Layer } from '@/lib/domains'

const state: { bearings: HomeBearings; layers: Set<Layer>; people: string[] } = {} as never

vi.mock('@/contexts/GoalsContext', () => ({ GoalsProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/hooks/useHomeBearings', () => ({ useHomeBearings: () => state.bearings }))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: { currentTemp: 64, condition: 'Clear' } }) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: state.layers }) }))
vi.mock('@/hooks/useAssigneeFilter', () => ({ useAssigneeFilter: () => [state.people, vi.fn()] }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [{ id: 'm1', name: 'Iris' }] }) }))

import { HomePage } from './HomePage'
import { lensLine } from '@/lib/home/bearings'
import { ALL_LAYERS } from '@/lib/domains'

const level = (name: string) => ({ name, open: 2, planned: true, review: 0, reviewName: 'September' })
function bearings(over: Partial<HomeBearings['facts']> = {}, rest: Partial<HomeBearings> = {}): HomeBearings {
  return {
    loaded: true,
    facts: {
      now: new Date(), weekDaysLeft: 7, week: { planned: false, open: 3, done: 0 },
      month: level('October'), season: level('Fall'), inbox: 0, todayChosen: 1, eventsAhead: 0, ...over,
    },
    rungs: [
      { level: 'year', name: '2026', status: 'Reference · one intention', attention: false, sample: 'Be outside more', to: '/year' },
      { level: 'week', name: 'Week 41', status: 'Not planned yet · three waiting', attention: true, sample: null, to: '/week' },
      { level: 'today', name: 'Today', status: 'No events · one chosen', attention: false, sample: 'Call CVS', to: '/today' },
    ],
    events: [], allDay: [], chosen: [{ id: 't1', title: 'Call CVS', forLine: 'Get the prescriptions sorted' }],
    discussions: [], calendarConnected: true, calendarLoading: false, firstName: 'Scott',
    ...rest,
  }
}

const renderHome = () => render(<MemoryRouter><HomePage /></MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  state.bearings = bearings()
  state.layers = new Set(ALL_LAYERS)
  state.people = []
})

describe('Home', () => {
  it('greets, suggests one next step and links it', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/, Scott$/)
    expect(screen.getByRole('heading', { name: 'The week ahead hasn’t been planned yet.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan the week' })).toHaveAttribute('href', '/week?view=alongside')
    expect(screen.getByText('↳ for Get the prescriptions sorted')).toBeInTheDocument()
  })

  it('sets a suggestion aside for the day with Not now', () => {
    state.bearings = bearings({ inbox: 8 })
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.getByRole('heading', { name: 'Eight captures are waiting in the Inbox.' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('symphony-home-set-aside')!).ids).toEqual(['plan-week'])
  })

  it('hides Waiting on you when nothing waits, and shows it when something does', () => {
    const { unmount } = renderHome()
    expect(screen.queryByRole('heading', { name: 'Waiting on you' })).not.toBeInTheDocument()
    unmount()
    state.bearings = bearings({ inbox: 2 })
    renderHome()
    expect(screen.getByRole('heading', { name: 'Waiting on you' })).toBeInTheDocument()
    expect(screen.getByText('Two captures in the Inbox.')).toBeInTheDocument()
  })

  it('says which lens is on when it is narrower than everything', () => {
    const { unmount } = renderHome()
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
    unmount()
    state.layers = new Set<Layer>(['work'])
    state.people = ['m1']
    renderHome()
    expect(screen.getByText('Showing Work only, for Iris')).toBeInTheDocument()
  })

  it('holds its sentences back until everything has loaded', () => {
    state.bearings = { ...bearings(), loaded: false }
    renderHome()
    expect(screen.getByRole('status')).toHaveTextContent('Getting your bearings…')
    expect(screen.queryByRole('link', { name: 'Plan the week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Where you are' })).not.toBeInTheDocument()
  })

  it('marks where you are on the ladder', () => {
    renderHome()
    const here = screen.getAllByText('You are here')[0].closest('li')
    expect(here).toHaveAttribute('aria-current', 'step')
    expect(here).toHaveTextContent('Today')
  })
})

describe('lensLine', () => {
  it('names the areas and people on', () => {
    expect(lensLine(new Set(ALL_LAYERS), [])).toBeNull()
    expect(lensLine(new Set<Layer>(['work']), [])).toBe('Showing Work only')
    expect(lensLine(new Set<Layer>(['work', 'family']), ['Iris'])).toBe('Showing Work and Family, for Iris')
  })
})

describe('Home is mounted', () => {
  it('is in the live registry at /overview, so the Symphony mark lands on a page', async () => {
    const { appRegistry } = await import('@/shell/appRegistry')
    const app = appRegistry.find((a) => a.route === '/overview')
    expect(app?.Component).toBe(HomePage)
  })
})
