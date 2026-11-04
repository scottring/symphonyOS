import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GiveThemADay } from './GiveThemADay'

describe('GiveThemADay', () => {
  it('tap a thing, then a day; the day is stamped and the next one waits, already chosen', async () => {
    const placeA = vi.fn(async () => true)
    const placeB = vi.fn(async () => true)
    const day = (n: number, past = false) => ({ key: `d${n}`, date: new Date(2026, 9, n), label: `Day ${n}`, isWeekend: false, past, lines: n === 20 ? ['9a Boxing'] : [], more: 0 })
    render(<GiveThemADay days={[day(19, true), day(20), day(21)]} placedCount={2} primary={{ label: 'Done planning', run: vi.fn() }}
      items={[{ key: 'a', title: 'Decide safe or box', from: 'October goal · Organize documents', onPlace: placeA }, { key: 'b', title: 'Return library books', from: 'Not under a goal', onPlace: placeB }]} />)
    expect(screen.getByText(/2 on this week with no day · 2 have one/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Day 19/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Give “Decide safe or box” Day 20' }))
    await waitFor(() => expect(placeA).toHaveBeenCalledWith(new Date(2026, 9, 20)))
    expect(screen.getByRole('img', { name: /day 20/i })).toBeTruthy()
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('Return library books')
  })
})
