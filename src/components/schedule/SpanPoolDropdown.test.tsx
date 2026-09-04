import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { SpanPoolDropdown } from './SpanPoolDropdown'
import type { Span } from '@/types/span'
import type { Task } from '@/types/task'

const d = (day: number) => new Date(2026, 8, day)

const span = (over: Partial<Span> = {}): Span => ({
  id: 's1', userId: 'u1', name: 'Labor Day weekend',
  startDate: d(5), endDate: d(7), context: 'family', scope: 'compound',
  createdAt: d(1), updatedAt: d(1), ...over,
})

const task = (over: Partial<Task> = {}): Task =>
  ({ id: 't1', title: 'Pack the cooler', completed: false, bucket: 'span', spanId: 's1',
     createdAt: d(1), updatedAt: d(1), ...over }) as Task

function setup(over: Partial<React.ComponentProps<typeof SpanPoolDropdown>> = {}) {
  const props = {
    spans: [span()], tasks: [task()], viewedDate: d(4),
    onCreateSpan: vi.fn().mockResolvedValue(span()),
    onDeleteSpan: vi.fn(),
    onUpdateTask: vi.fn(),
    ...over,
  }
  return { ...render(<SpanPoolDropdown {...props} />), props }
}

describe('SpanPoolDropdown', () => {
  // The trigger names the span, not the category — the whole point is to focus
  // on THAT weekend, and "Spans" would say nothing about which one is coming.
  it('names the nearest span on the trigger', () => {
    setup()
    expect(screen.getByRole('button', { name: /labor day weekend pool/i })).toBeInTheDocument()
  })

  it('falls back to the category label when there is no range to show', () => {
    setup({ spans: [] })
    expect(screen.getByRole('button', { name: /custom range/i })).toBeInTheDocument()
  })

  it('shows the span\'s shape and its pool when opened', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /labor day weekend pool/i }))
    expect(screen.getByText(/Sat, Sep 5 – Mon, Sep 7 · 3 days/)).toBeInTheDocument()
    expect(screen.getByText('Pack the cooler')).toBeInTheDocument()
  })

  it('says so plainly when nothing is planned into it yet', async () => {
    const { user } = setup({ tasks: [] })
    await user.click(screen.getByRole('button', { name: /labor day weekend pool/i }))
    expect(screen.getByText(/nothing planned into it yet/i)).toBeInTheDocument()
  })

  // A span that has already ended is not a destination — the same reason a
  // stale week placement strands work on a week nobody reopens.
  it('offers no ended span, even when one exists', () => {
    setup({ spans: [span({ startDate: d(1), endDate: d(2) })], viewedDate: d(10) })
    expect(screen.getByRole('button', { name: /custom range/i })).toBeInTheDocument()
  })

  it('adds a task straight onto the selected span', async () => {
    const onAddToSpan = vi.fn()
    const { user } = setup({ onAddToSpan })
    await user.click(screen.getByRole('button', { name: /labor day weekend pool/i }))
    await user.type(screen.getByRole('textbox', { name: /add to labor day weekend/i }), 'Book the campsite{Enter}')
    expect(onAddToSpan).toHaveBeenCalledWith('Book the campsite', 's1')
  })

  it('creates a span inline, defaulting to the coming Sat–Mon', async () => {
    const onCreateSpan = vi.fn().mockResolvedValue(span())
    const { user } = setup({ spans: [], onCreateSpan })
    await user.click(screen.getByRole('button', { name: /custom range/i }))
    await user.click(screen.getByRole('button', { name: /new custom range/i }))
    await user.type(screen.getByRole('textbox', { name: /span name/i }), 'Fall break')
    await user.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreateSpan).toHaveBeenCalledTimes(1)
    const arg = onCreateSpan.mock.calls[0][0]
    expect(arg.name).toBe('Fall break')
    // viewedDate is Fri Sep 4 → Sat Sep 5 through Mon Sep 7.
    expect(arg.startDate.getDate()).toBe(5)
    expect(arg.endDate.getDate()).toBe(7)
  })

  it('refuses a span whose last day precedes its first', async () => {
    const onCreateSpan = vi.fn()
    const { user } = setup({ spans: [], onCreateSpan })
    await user.click(screen.getByRole('button', { name: /custom range/i }))
    await user.click(screen.getByRole('button', { name: /new custom range/i }))
    await user.type(screen.getByRole('textbox', { name: /span name/i }), 'Backwards')
    const last = screen.getByLabelText(/last day/i)
    await user.clear(last)
    await user.type(last, '2026-09-01')
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled()
    expect(onCreateSpan).not.toHaveBeenCalled()
  })

  it('lets you switch between spans when there are several', async () => {
    const other = span({ id: 's2', name: 'Fall break', startDate: d(20), endDate: d(24) })
    const { user } = setup({ spans: [span(), other] })
    await user.click(screen.getByRole('button', { name: /labor day weekend pool/i }))
    await user.click(screen.getByRole('button', { name: 'Fall break' }))
    expect(screen.getByText(/Sun, Sep 20 – Thu, Sep 24 · 5 days/)).toBeInTheDocument()
  })

  // Deleting the container must not look like deleting the plan.
  it('deleting a span is offered per-span, not globally', async () => {
    const onDeleteSpan = vi.fn()
    const { user } = setup({ onDeleteSpan })
    await user.click(screen.getByRole('button', { name: /labor day weekend pool/i }))
    await user.click(screen.getByRole('button', { name: /delete labor day weekend/i }))
    expect(onDeleteSpan).toHaveBeenCalledWith('s1')
  })
})
