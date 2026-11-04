import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TriageWhenMenu } from './TriageWhenMenu'

describe('TriageWhenMenu', () => {
  it('renders the horizon groups + delete', () => {
    render(<TriageWhenMenu onPick={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Someday' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  // Final review (2026-11-04): This month and Next month were removed for
  // every caller. They are gated like This season: a family member's list
  // keeps them; the Week's own list (months={false} season={false}) has none.
  it('by default offers Month: This month, Next month and This season', async () => {
    const onPick = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Month' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['This month', 'Next month', 'This season'])
    await user.click(screen.getByRole('menuitem', { name: 'Next month' }))
    expect(onPick).toHaveBeenCalledWith('next-month')
  })

  it('months={false} season={false} (the Week canvas) offers nothing above the week', async () => {
    const { user } = render(<TriageWhenMenu onPick={vi.fn()} months={false} season={false} />)
    expect(screen.queryByRole('button', { name: 'Month' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Season' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Week' }))
    expect(screen.queryByRole('menuitem', { name: 'This month' })).toBeNull()
    expect(screen.queryByText('Next month')).toBeNull()
    expect(screen.getByRole('button', { name: 'Someday' })).toBeInTheDocument()
  })

  it('season={false} alone keeps the months; months={false} alone leaves This season on its own', async () => {
    const { user, unmount } = render(<TriageWhenMenu onPick={vi.fn()} season={false} />)
    await user.click(screen.getByRole('button', { name: 'Month' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['This month', 'Next month'])
    unmount()
    const onPick = vi.fn()
    const second = render(<TriageWhenMenu onPick={onPick} months={false} />)
    await second.user.click(screen.getByRole('button', { name: 'Season' }))
    expect(onPick).toHaveBeenCalledWith('this-season')
  })

  it('Someday applies directly (single option, no fan-out)', async () => {
    const onPick = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onPick).toHaveBeenCalledWith('someday')
    // No menu opened for a single-option group
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Today fans out to Tonight and Tomorrow on click', async () => {
    const onPick = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tonight' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tomorrow' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Tomorrow' }))
    expect(onPick).toHaveBeenCalledWith('tomorrow')
  })

  it('Week fans out to this/next week + this/next weekend', async () => {
    const onPick = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Week' }))
    expect(screen.getByRole('menuitem', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Next week' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'This weekend' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Next weekend' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Next weekend' }))
    expect(onPick).toHaveBeenCalledWith('next-weekend')
  })

  it('Pick date opens a date form and submits a specific slot', async () => {
    const onPickDate = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={vi.fn()} onDelete={vi.fn()} onPickDate={onPickDate} />)
    await user.click(screen.getByRole('button', { name: 'Pick date' }))
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-06-20' } })
    await user.click(screen.getByRole('button', { name: /Set date/ }))
    expect(onPickDate).toHaveBeenCalledWith(expect.any(Date), true)
  })

  it('no Pick date chip when onPickDate is omitted', () => {
    render(<TriageWhenMenu onPick={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Pick date' })).not.toBeInTheDocument()
  })

  it('delete fires onDelete', async () => {
    const onDelete = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={vi.fn()} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalled()
  })
})

// Regression: the fan-out used to close 160ms after the pointer left the
// button, so crossing the gap to the panel — or pausing to read the four
// options — dismissed the menu under the cursor and the click landed on
// nothing. "I clicked This week and nothing happened."
describe('TriageWhenMenu — the fan-out survives the trip to it', () => {
  it('a menu opened by click stays open when the pointer leaves the button', async () => {
    vi.useFakeTimers()
    try {
      const onPick = vi.fn()
      render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Week' }))
      fireEvent.mouseLeave(screen.getByRole('button', { name: 'Week' }).parentElement!)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(screen.getByRole('menuitem', { name: 'This week' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('menuitem', { name: 'This week' }))
      expect(onPick).toHaveBeenCalledWith('this-week')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a hover-opened menu still tidies itself away, but only after a human-sized grace period', async () => {
    vi.useFakeTimers()
    try {
      render(<TriageWhenMenu onPick={vi.fn()} onDelete={vi.fn()} />)
      const group = screen.getByRole('button', { name: 'Week' }).parentElement!
      fireEvent.mouseEnter(group)
      expect(screen.getByRole('menuitem', { name: 'This week' })).toBeInTheDocument()
      fireEvent.mouseLeave(group)
      // Still there while you're crossing the gap…
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByRole('menuitem', { name: 'This week' })).toBeInTheDocument()
      // …gone once you've clearly moved on.
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.queryByRole('menuitem', { name: 'This week' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

it('Escape closes the fan-out without picking anything', () => {
  const onPick = vi.fn()
  render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Week' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menuitem', { name: 'This week' })).not.toBeInTheDocument()
  expect(onPick).not.toHaveBeenCalled()
})
