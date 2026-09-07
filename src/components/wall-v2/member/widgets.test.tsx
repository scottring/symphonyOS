import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { AppointmentsWidget } from './AppointmentsWidget'
import { KidsWidget } from './KidsWidget'
import { ComingUpWidget } from './ComingUpWidget'
import { DinnerWidget } from './DinnerWidget'

describe('AppointmentsWidget', () => {
  it('lists the hour large with the title and a location beneath', () => {
    render(<AppointmentsWidget rows={[{ id: 'a', time: '4:00', title: 'Dentist', detail: 'Main St', past: false, free: false }]} />)
    expect(screen.getByText('4:00')).toBeInTheDocument()
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(screen.getByText('Main St')).toBeInTheDocument()
  })
  it('says the day is clear when there is nothing', () => {
    render(<AppointmentsWidget rows={[]} />)
    expect(screen.getByText('Nothing on the clock today')).toBeInTheDocument()
  })
})

describe('KidsWidget', () => {
  it('one tappable row per kid: special, and the handoff I am driving', () => {
    const onOpenKid = vi.fn()
    render(<KidsWidget kids={[
      { id: 'e', name: 'Ella', special: 'Visual Art', handoff: '6:30 Drop off Ella & Kaleb at FFG' },
      { id: 'k', name: 'Kaleb', special: null, handoff: null },
    ]} onOpenKid={onOpenKid} />)
    fireEvent.click(screen.getByRole('button', { name: "Open Ella's day" }))
    expect(onOpenKid).toHaveBeenCalledWith('e')
    expect(screen.getByText('Visual Art')).toBeInTheDocument()
    expect(screen.getByText('6:30 Drop off Ella & Kaleb at FFG')).toBeInTheDocument()
    expect(screen.getByText('Nothing special')).toBeInTheDocument()
  })
})

describe('ComingUpWidget', () => {
  it('one line a day', () => {
    render(<ComingUpWidget rows={[{ dateKey: '2026-09-09', dayLabel: 'Wed', summary: 'Wheelies' }]} />)
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('Wheelies')).toBeInTheDocument()
  })
})

describe('DinnerWidget', () => {
  it('names tonight and opens the recipe', () => {
    const onOpen = vi.fn()
    render(<DinnerWidget tonight="Tacos" onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open recipe' }))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.getByText('Tacos')).toBeInTheDocument()
  })
  it('says nothing is planned without a button', () => {
    render(<DinnerWidget tonight={null} />)
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
