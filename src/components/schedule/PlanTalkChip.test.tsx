import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types/task'
import { PlanTalkChip } from './PlanTalkChip'

const launcher = vi.hoisted(() => ({ openAssistant: vi.fn() }))
const goalsApi = vi.hoisted(() => ({ goals: [] as { year: number; status: string }[], loading: false, calls: 0 }))
vi.mock('@/contexts/AssistantLaunchContext', () => ({ useAssistantLauncher: () => launcher }))
vi.mock('@/hooks/useGoals', () => ({ useGoals: () => { goalsApi.calls++; return goalsApi } }))
// Scott's quarters: Winter from Jan 1, Fall from Oct 1.
vi.mock('@/hooks/useHouseholdSeasons', () => ({ useHouseholdSeasons: () => ({ seasons: [
  { name: 'Winter', month: 1, day: 1 }, { name: 'Spring', month: 4, day: 1 }, { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
] }) }))

// Month, Season and Year on schedule, on Today (spec 2026-10-14, mockup "After 2").

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9)
const show = (today: Date, tasks: Task[] = []) => render(<p><PlanTalkChip tasks={tasks} meId={null} today={today} /></p>)

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); goalsApi.goals = []; goalsApi.loading = false; goalsApi.calls = 0 })

describe('PlanTalkChip', () => {
  it('three days before November: “November starts Sunday · Plan it”, which sends Plan November.', () => {
    show(at(2026, 10, 30))
    fireEvent.click(screen.getByRole('button', { name: 'November starts Sunday · Plan it' }))
    expect(launcher.openAssistant).toHaveBeenCalledWith({ message: 'Plan November.', autoSend: true })
    // Outside the year's window, year goals are not even fetched.
    expect(goalsApi.calls).toBe(0)
  })
  it('says nothing outside a window, or once the coming list has something on it', () => {
    show(at(2026, 10, 15))
    expect(screen.queryByRole('group')).toBeNull()
    const cabin = { id: 'c', title: 'Book the cabin', bucket: 'month', monthStart: new Date(2026, 10, 1), createdAt: new Date(2026, 9, 1), completed: false } as Task
    show(at(2026, 10, 30), [cabin])
    expect(screen.queryByRole('group')).toBeNull()
  })
  it('Later hides it until tomorrow; Not this time until the next period', () => {
    const { unmount } = show(at(2026, 10, 30))
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('group', { name: 'Plan November' })).toBeNull()
    unmount()
    show(at(2026, 10, 31))
    expect(screen.getByRole('group', { name: 'Plan November' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }))
    expect(screen.queryByRole('group', { name: 'Plan November' })).toBeNull()
  })
  it('late December offers one at a time: the year, then Winter, then January', () => {
    show(at(2026, 12, 30))
    expect(screen.getByRole('group', { name: 'Plan 2027' })).toHaveTextContent('2027 starts Friday · Plan it')
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }))
    expect(screen.getByRole('group', { name: 'Plan Winter' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }))
    expect(screen.getByRole('group', { name: 'Plan January' })).toBeInTheDocument()
  })
  it('the year waits for its goals to load, and steps aside once next year has some', () => {
    goalsApi.loading = true
    const { unmount } = show(at(2026, 12, 30))
    expect(screen.queryByRole('group')).toBeNull()
    unmount()
    goalsApi.loading = false
    goalsApi.goals = [{ year: 2027, status: 'active' }]
    show(at(2026, 12, 30))
    expect(screen.getByRole('group', { name: 'Plan Winter' })).toBeInTheDocument()
  })
})
