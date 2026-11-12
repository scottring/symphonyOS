import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KeepUntilDoneOffer } from './KeepUntilDoneOffer'
import type { Routine } from '@/types/routine'

const r = (id: string, name: string, recurrence_pattern: unknown, over: Partial<Routine> = {}): Routine =>
  ({ id, name, visibility: 'active', show_on_timeline: true, recurrence_pattern, keep_until_done: false, parent_routine_id: null, ...over } as unknown as Routine)
const ffg = r('ffg', 'Pay FFG', { type: 'monthly', day_of_month: 10 })

describe('KeepUntilDoneOffer', () => {
  beforeEach(() => localStorage.clear())

  it('offers the rare routines, and Ask sends Symphony the message once', () => {
    const onAsk = vi.fn()
    const { unmount } = render(<KeepUntilDoneOffer routines={[ffg, r('trash', 'Trash', { type: 'weekly', days: ['tue'] })]} onAsk={onAsk} />)
    expect(screen.getByText(/“Pay FFG” comes round monthly or less often/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask Symphony' }))
    expect(onAsk).toHaveBeenCalledWith(expect.stringContaining('“Pay FFG”'))
    expect(screen.queryByRole('button', { name: 'Ask Symphony' })).toBeNull()
    unmount()
    render(<KeepUntilDoneOffer routines={[ffg]} onAsk={onAsk} />)
    expect(screen.queryByRole('button', { name: 'Ask Symphony' })).toBeNull()
  })

  it('Not now puts it off until a new rare routine appears; nothing to offer, nothing drawn', () => {
    const { unmount } = render(<KeepUntilDoneOffer routines={[ffg]} onAsk={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    unmount()
    render(<KeepUntilDoneOffer routines={[ffg, r('tax', 'Pay taxes', { type: 'yearly' })]} onAsk={vi.fn()} />)
    expect(screen.getByText(/2 routines come round/)).toBeInTheDocument()
    const { container } = render(<KeepUntilDoneOffer routines={[{ ...ffg, keep_until_done: true }]} onAsk={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
