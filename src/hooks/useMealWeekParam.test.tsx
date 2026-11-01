import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useMealWeekParam } from './useMealWeekParam'

function Probe() {
  const offset = useMealWeekParam(0)
  const where = useLocation()
  return <><output data-testid="offset">{offset}</output><output data-testid="where">{where.pathname + where.search}</output></>
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 4, 15)) })
afterEach(() => { vi.useRealTimers() })

describe('useMealWeekParam — the Meals page opened on a week', () => {
  it('opens on the week asked for, then takes ?week= out of the address', () => {
    render(<MemoryRouter initialEntries={['/meals/plan?week=2026-11-08&x=1']}><Probe /></MemoryRouter>)
    expect(screen.getByTestId('offset')).toHaveTextContent('1')
    expect(screen.getByTestId('where')).toHaveTextContent('/meals/plan?x=1')
  })

  it('with no week, this week and the address untouched', () => {
    render(<MemoryRouter initialEntries={['/meals/plan']}><Probe /></MemoryRouter>)
    expect(screen.getByTestId('offset')).toHaveTextContent('0')
    expect(screen.getByTestId('where')).toHaveTextContent('/meals/plan')
  })
})
