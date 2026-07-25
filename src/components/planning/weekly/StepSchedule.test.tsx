// src/components/planning/weekly/StepSchedule.test.tsx
//
// The week rung places into a DAY, so the grid must show the days you can
// place on. StepSchedule passed no `initialDays`, so PlanningSession fell back
// to its default of ONE — meaning "place the big rocks" offered a single
// column while /week (same component, initialDays={7}) showed the whole week.
// Same component, different day count: exactly the drift the shared-component
// parity rule is supposed to make impossible.

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { StepSchedule } from './StepSchedule'

const base = {
  weekDate: new Date(2026, 6, 19),
  priorities: [],
  events: [],
  routines: [],
  onUpdateTask: vi.fn(),
  onPushTask: vi.fn(),
}

describe('StepSchedule day columns', () => {
  it('opens on the whole week by default, not a single day', () => {
    const { container } = render(<StepSchedule {...base} />)
    expect(container.querySelectorAll('[data-testid^="day-column-"]')).toHaveLength(7)
  })

  it('honors a shorter run of days for a mid-week session', () => {
    const { container } = render(<StepSchedule {...base} days={3} />)
    expect(container.querySelectorAll('[data-testid^="day-column-"]')).toHaveLength(3)
  })

  it('draws no hour axis — the hour is Today’s question, not the week’s', () => {
    const { container } = render(<StepSchedule {...base} />)
    expect(container.textContent).not.toContain('6 AM')
    expect(container.textContent).not.toContain('10 PM')
  })
})
