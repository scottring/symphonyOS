import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { WriteListStep } from './WriteListStep'
import { renderStep, makeHost } from './testHarness'
import { PICK_CAP } from '@/lib/planning/betPulse'
import type { Task } from '@/types/task'

const step = {
  id: 'write-week', type: 'write-list' as const, title: 'Write the week\'s list',
  narration: 'Around fifteen items is the honest ceiling.',
  props: { bucket: 'week' as const, softCap: 15 },
}

const t = (over: Record<string, unknown>) => ({
  id: 'x', title: 'Item', completed: false, scheduledFor: undefined,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as unknown as Task

describe('WriteListStep', () => {
  it('creates into the bucket ATOMICALLY via createTaskInBucket (race guard)', async () => {
    const host = makeHost()
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    const input = screen.getByPlaceholderText(/Add a task to this week|Add a chunk to this month|Add an outcome for this season/)
    fireEvent.change(input, { target: { value: 'Call the plumber' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith('Call the plumber', 'week', { projectId: undefined })
    // The atomic-create contract: WriteListStep must never call onSetBucket.
    expect(host.onSetBucket).not.toHaveBeenCalled()
  })

  it('a #project tag attaches the chunk to its project at birth', () => {
    const host = makeHost({
      projects: [{ id: 'p1', name: 'Kitchen Renovation' } as unknown as import('@/types/project').Project],
    })
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    const input = screen.getByPlaceholderText(/Add a task to this week|Add a chunk to this month|Add an outcome for this season/)
    fireEvent.change(input, { target: { value: '#kitchen order dishwasher' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith('order dishwasher', 'week', { projectId: 'p1' })
  })

  it('season list (rows: plain) shows no triage chips and no Done check', () => {
    const seasonStep = {
      id: 'write-season', type: 'write-list' as const, title: 'Write the season\'s list',
      narration: 'Concrete, specific things.',
      props: { bucket: 'quarter' as const, rows: 'plain' as const },
    }
    const host = makeHost({ tasks: [t({ id: 'q1', title: 'Make home into home', bucket: 'quarter' })] })
    renderStep(<WriteListStep />, { step: seasonStep, host, horizon: 'seasonal' })
    expect(screen.getByText('Make home into home')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Carry forward|Put aside/ })).not.toBeInTheDocument()
  })

  it('picks mode (rows: bets) shows picked-vs-written and goes amber once the list is over PICK_CAP', () => {
    const betStep = {
      id: 'write-season', type: 'write-list' as const, title: 'Write the season\'s list',
      narration: 'Concrete, specific things.',
      props: { bucket: 'quarter' as const, rows: 'bets' as const },
    }
    const tasks = Array.from({ length: 9 }, (_, i) =>
      t({ id: `q${i}`, title: `Bet ${i}`, bucket: 'quarter', pickedAt: i < 3 ? new Date(2026, 6, 1 + i) : undefined }))
    const host = makeHost({ tasks })
    renderStep(<WriteListStep />, { step: betStep, host, horizon: 'seasonal' })
    expect(screen.getByText(/3 of 10 picked · 9 written/)).toBeInTheDocument()
    expect(PICK_CAP).toBe(10)
  })

  it('shows the soft-cap counter without blocking', () => {
    const tasks = Array.from({ length: 16 }, (_, i) => t({ id: `w${i}`, title: `Task ${i}`, bucket: 'week' }))
    const host = makeHost({ tasks })
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    expect(screen.getByText(/16 of ~15/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Add a task to this week|Add a chunk to this month|Add an outcome for this season/)).toBeEnabled()
  })

  it('renders the fun-composition recipe chips when funComposition is set', () => {
    const monthStep = {
      id: 'write-month', type: 'write-list' as const, title: 'Write the month\'s list',
      narration: 'Concrete, specific things.',
      props: { bucket: 'month' as const, funComposition: true },
    }
    const host = makeHost()
    renderStep(<WriteListStep />, { step: monthStep, host, horizon: 'monthly' })
    expect(screen.getByText('One big experience')).toBeInTheDocument()
    expect(screen.getByText('A few social things')).toBeInTheDocument()
    expect(screen.getByText('A themed quest — optional')).toBeInTheDocument()
  })

  it('omits the recipe chips without funComposition', () => {
    const monthStep = {
      id: 'write-month', type: 'write-list' as const, title: 'Write the month\'s list',
      narration: 'Concrete, specific things.',
      props: { bucket: 'month' as const },
    }
    const host = makeHost()
    renderStep(<WriteListStep />, { step: monthStep, host, horizon: 'monthly' })
    expect(screen.queryByText('One big experience')).not.toBeInTheDocument()
  })
})

// ── The step's job is WRITING. A wall of already-written rows, each carrying a
// ✨ and a Change, read as "audit these" and buried the one input that does the
// work (Scott, 2026-07-25: "just mark what's fun?"). ──
describe('WriteListStep — writing beats auditing', () => {
  const monthStep = {
    id: 'write-month', type: 'write-list' as const, title: 'Everything else the month needs',
    narration: 'Build the fun on purpose.',
    props: { bucket: 'month' as const, funComposition: true },
  }
  const many = Array.from({ length: 12 }, (_, i) =>
    t({ id: `m${i}`, title: `Written item ${i}`, bucket: 'month' }))

  it('collapses a long written list to a count instead of a wall of rows', () => {
    renderStep(<WriteListStep />, { step: monthStep, host: makeHost({ tasks: many }), horizon: 'monthly' })
    expect(screen.getByText('12 already written')).toBeInTheDocument()
    expect(screen.queryByText('Written item 0')).not.toBeInTheDocument()
  })

  it('opens the written list on request', () => {
    renderStep(<WriteListStep />, { step: monthStep, host: makeHost({ tasks: many }), horizon: 'monthly' })
    fireEvent.click(screen.getByText('12 already written'))
    expect(screen.getByText('Written item 0')).toBeInTheDocument()
  })

  it('a short list still shows in full — nothing to collapse', () => {
    const few = [t({ id: 'm1', title: 'Only item', bucket: 'month' })]
    renderStep(<WriteListStep />, { step: monthStep, host: makeHost({ tasks: few }), horizon: 'monthly' })
    expect(screen.getByText('Only item')).toBeInTheDocument()
    expect(screen.queryByText(/already written/)).not.toBeInTheDocument()
  })

  it('a fun prompt seeds the input and stamps the next item fun — built, not audited', () => {
    const host = makeHost({ tasks: many })
    renderStep(<WriteListStep />, { step: monthStep, host, horizon: 'monthly' })
    fireEvent.click(screen.getByText('One big experience'))
    const input = screen.getByPlaceholderText(/Add a chunk to this month/)
    fireEvent.change(input, { target: { value: 'Take the kids to the shore' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith(
      'Take the kids to the shore', 'month', { projectId: undefined, isFun: true },
    )
  })

  it('an ordinary add is not marked fun', () => {
    const host = makeHost({ tasks: many })
    renderStep(<WriteListStep />, { step: monthStep, host, horizon: 'monthly' })
    const input = screen.getByPlaceholderText(/Add a chunk to this month/)
    fireEvent.change(input, { target: { value: 'Renew the registration' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith(
      'Renew the registration', 'month', { projectId: undefined, isFun: undefined },
    )
  })
})
