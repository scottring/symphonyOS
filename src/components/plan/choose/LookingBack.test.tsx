import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useState } from 'react'
import { LookingBack } from './LookingBack'
import type { ReviewNotes } from '@/hooks/usePeriodReview'

describe('LookingBack', () => {
  afterEach(() => { vi.useRealTimers() })

  it('shows the count and two places; moving on saves them, and a failed save says so', async () => {
    const onContinue = vi.fn(async () => false)
    render(<LookingBack kicker="Review September · then plan October" periodWord="September" done={11} outOf={16} notDone={3}
      nextLabel="On to Fall goals → October" onContinue={onContinue} onLeave={vi.fn()} />)
    expect(screen.getByText(/of 16 done · 3 not done/)).toBeTruthy()
    expect(screen.getByRole('img', { name: '11 of 16 done' }).querySelector('span')?.style.width).toBe('68.75%')
    expect(screen.queryByText(/Also done/)).toBeNull()
    expect(screen.getByText(/The 3 not done come next/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'What went well' }), { target: { value: 'Rooms finished' } })
    fireEvent.click(screen.getByRole('button', { name: 'On to Fall goals → October' }))
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith({ wentWell: 'Rooms finished', didnt: '' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Didn’t save')
  })

  // Scott, 2026-11-05: "7 of 23 done · 13 not done" hid the 3 already moved on.
  it('compact: every line of the period is accounted for', () => {
    render(<LookingBack compact periodWord="October" done={7} outOf={23} notDone={13} nextLabel="Save notes" onContinue={vi.fn(async () => true)} />)
    expect(screen.getByText(/done · 3 moved on · 13 open/)).toBeTruthy()
    expect(screen.queryByText(/of 23/)).toBeNull()
  })

  // Notes were the one thing in planning with a Save button.
  it('compact: no Save button; the notes save after a pause and when the box is left', async () => {
    vi.useFakeTimers()
    const onContinue = vi.fn(async (_: ReviewNotes) => true)
    function Host() {
      const [v, setV] = useState<ReviewNotes>({ wentWell: '', didnt: '' })
      const [saved, setSaved] = useState<ReviewNotes>({ wentWell: '', didnt: '' })
      const unsaved = v.wentWell.trim() !== saved.wentWell || v.didnt.trim() !== saved.didnt
      return <LookingBack compact periodWord="October" done={1} notDone={0} nextLabel="Save notes" value={v} onChange={setV} unsaved={unsaved}
        reviewed={saved.wentWell ? 'Saved Nov 5' : null}
        onContinue={async (n) => { const ok = await onContinue(n); if (ok) setSaved(n); return ok }} />
    }
    render(<Host />)
    expect(screen.queryByRole('button', { name: 'Save notes' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'What went well' }), { target: { value: 'Baseball' } })
    expect(onContinue).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1300) })
    expect(onContinue).toHaveBeenCalledWith({ wentWell: 'Baseball', didnt: '' })
    expect(screen.getByText('Saved Nov 5')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'What didn’t' }), { target: { value: 'Sleep' } })
    await act(async () => { fireEvent.blur(screen.getByRole('textbox', { name: 'What didn’t' })) })
    expect(onContinue).toHaveBeenLastCalledWith({ wentWell: 'Baseball', didnt: 'Sleep' })
  })

  // Final review: a failed autosave must not retry on its own forever.
  it('compact: a failed save waits for more typing or leaving the box before trying again', async () => {
    vi.useFakeTimers()
    const onContinue = vi.fn(() => new Promise<boolean>((r) => setTimeout(() => r(false), 300)))
    function Host() {
      const [v, setV] = useState<ReviewNotes>({ wentWell: '', didnt: '' })
      return <LookingBack compact periodWord="October" done={1} notDone={0} nextLabel="Save notes" value={v} onChange={setV}
        unsaved={v.wentWell.trim() !== ''} onContinue={onContinue} />
    }
    render(<Host />)
    fireEvent.change(screen.getByRole('textbox', { name: 'What went well' }), { target: { value: 'Baseball' } })
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save')
    await act(async () => { fireEvent.blur(screen.getByRole('textbox', { name: 'What went well' })) })
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(onContinue).toHaveBeenCalledTimes(2)
  })
})
