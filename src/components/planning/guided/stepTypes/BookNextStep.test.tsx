// src/components/planning/guided/stepTypes/BookNextStep.test.tsx
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { BookNextStep } from './BookNextStep'
import { renderStep, makeHost } from './testHarness'

const step = {
  id: 'book-next', type: 'book-next' as const, title: 'Anchor the next step',
  narration: 'Book the next session before you close.',
  props: { bookHorizon: 'monthly' as const, bookTitle: 'Monthly planning session' },
}

describe('BookNextStep', () => {
  it('creates a calendar event when connected', async () => {
    const host = makeHost({ calendarConnected: true })
    renderStep(<BookNextStep />, { step, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /Put it on the calendar/ }))
    await waitFor(() => expect(host.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Monthly planning session',
      startTime: expect.any(Date),
      endTime: expect.any(Date),
    })))
    expect(await screen.findByText(/Booked/)).toBeInTheDocument()
  })

  it('falls back to a dated task when the calendar is disconnected', async () => {
    const host = makeHost({ calendarConnected: false })
    renderStep(<BookNextStep />, { step, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /Add a reminder task/ }))
    await waitFor(() => expect(host.createDatedTask).toHaveBeenCalledWith('Monthly planning session', expect.any(Date)))
  })
})
