import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DatesCalendar } from './DatesCalendar'
import type { Landmark } from '@/lib/planning/v2/planV2'

const lm = (id: string, title: string, start: Date, end = start) => ({ id, title, start, end }) as Landmark

describe('DatesCalendar — dates we can’t move', () => {
  const OCT = new Date(2026, 9, 1), NOV = new Date(2026, 10, 1)
  const marks = [lm('c', 'Columbus Day', new Date(2026, 9, 12)), lm('b', 'Fall break', new Date(2026, 9, 19), new Date(2026, 9, 21))]

  it('a one-day date is a mark in its cell and named in the list beneath; a stretch keeps its bar', () => {
    const onSelect = vi.fn()
    const { container } = render(<DatesCalendar start={OCT} end={NOV} landmarks={marks} today={new Date(2026, 8, 29)} selected={null}
      onSelect={onSelect} onOpenWeek={vi.fn()} available planned={() => []} />)
    const dot = container.querySelector('.pv2-lm.is-dot') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.textContent).toBe('')
    expect(dot.getAttribute('aria-label')).toBe('Columbus Day')
    expect(container.querySelector('.pv2-lm.is-span')?.textContent).toBe('Fall break')
    const list = screen.getByRole('list', { name: 'The dates, in order' })
    expect(list.textContent).toMatch(/Oct 12\s*Columbus Day.*Oct 19–21\s*Fall break/)
    fireEvent.click(screen.getByRole('button', { name: /Oct 12\s*Columbus Day/ }))
    expect(onSelect).toHaveBeenCalledWith('c')
  })
})
