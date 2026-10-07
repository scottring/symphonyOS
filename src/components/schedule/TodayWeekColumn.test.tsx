import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { PLAN_MIME } from '@/lib/planning/planDrag'
import { TodayWeekColumn } from './TodayWeekColumn'

const day = new Date(2026, 9, 7)
const entry: DayPlanEntry = { key: 'task:t1', kind: 'task', id: 't1', title: 'Call the bank', completed: false, planned: false, group: 'week' } as DayPlanEntry
const plan = { chooserTasks: [entry], chooserRoutines: [] } as unknown as DayPlan

// Scott, 2026-10-07: the week beside the day should drag onto it.
describe('TodayWeekColumn', () => {
  it('lets a week row be dragged, carrying what it is and the day', () => {
    render(<MemoryRouter><TodayWeekColumn plan={plan} day={day} weekNo={41} weekStart={day} actions={{ choose: vi.fn() } as never} /></MemoryRouter>)
    const row = screen.getByText('Call the bank').closest('li')!
    expect(row).toHaveAttribute('draggable', 'true')
    const set: Record<string, string> = {}
    fireEvent.dragStart(row, { dataTransfer: { setData: (k: string, v: string) => { set[k] = v }, effectAllowed: '' } })
    expect(JSON.parse(set[PLAN_MIME])).toEqual({ kind: 'task', id: 't1', date: '2026-10-07', title: 'Call the bank' })
  })
})
