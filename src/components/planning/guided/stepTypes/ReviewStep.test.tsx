// src/components/planning/guided/stepTypes/ReviewStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { ReviewStep } from './ReviewStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

function task(over: Partial<Task>): Task {
  return {
    id: 't1', title: 'Order dishwasher', completed: false, scheduledFor: undefined,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as unknown as Task
}

const bucketStep = {
  id: 'month-review', type: 'review' as const, title: 'Last month’s list',
  narration: 'Here is what is still open from the month. Give each a fate.',
  props: { bucket: 'month' as const },
}

describe('ReviewStep — bucket source', () => {
  it('lists open items in the bucket and completes via Done', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Order dishwasher', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    expect(screen.getByText('Order dishwasher')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    expect(host.onCompleteTask).toHaveBeenCalledWith('a')
  })

  it('reveals an optional note field on the row after it is completed, and stays visible', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Order dishwasher', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    // Row remains (marked done) instead of vanishing, with a note field.
    expect(screen.getByText('Order dishwasher')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Add a note' })).toBeInTheDocument()
  })

  it('saves a completion note to the task notes field', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Order dishwasher', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    const noteInput = screen.getByRole('textbox', { name: 'Add a note' })
    fireEvent.change(noteInput, { target: { value: 'Picked the Bosch 800 series' } })
    fireEvent.blur(noteInput)
    expect(host.onUpdateTask).toHaveBeenCalledWith('a', { notes: 'Picked the Bosch 800 series' })
  })

  it('does not write notes when the field is left empty', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Order dishwasher', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    fireEvent.blur(screen.getByRole('textbox', { name: 'Add a note' }))
    expect(host.onUpdateTask).not.toHaveBeenCalled()
  })

  it('shows the empty state when the bucket is clear', () => {
    renderStep(<ReviewStep />, { step: bucketStep })
    expect(screen.getByText(/Nothing left open/)).toBeInTheDocument()
  })
})

describe('ReviewStep — seasonal fate rows', () => {
  const seasonStep = {
    id: 'season-review', type: 'review' as const, title: 'Last season’s list',
    narration: 'Carry it, change it, or put it aside.',
    props: { bucket: 'quarter' as const, rows: 'fate' as const },
  }

  it('shows season verdicts instead of the day/week/month triage menu', () => {
    const host = makeHost({ tasks: [task({ id: 'q1', title: 'Fix up outdoor spaces', bucket: 'quarter' })] })
    renderStep(<ReviewStep />, { step: seasonStep, host, horizon: 'seasonal' })
    // "Carry into this season" is the single persisting carry action; the old
    // cosmetic "Carry forward" toggle was folded (it never persisted anything).
    expect(screen.getByRole('button', { name: /Carry into this season/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Carry forward$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Put aside/ })).toBeInTheDocument()
    // No day-planning vocabulary at season altitude. (A season fate row DOES
    // offer Done — "it happened". The old assertion here named the triage
    // menu's 'Mark done' label, so it passed vacuously either way.)
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
  })

  it('Put aside parks the item on Someday', () => {
    const host = makeHost({ tasks: [task({ id: 'q1', title: 'Fix up outdoor spaces', bucket: 'quarter' })] })
    renderStep(<ReviewStep />, { step: seasonStep, host, horizon: 'seasonal' })
    fireEvent.click(screen.getByRole('button', { name: /Put aside/ }))
    expect(host.onSetBucket).toHaveBeenCalledWith('q1', 'someday')
  })

  it('Change edits the title in place', () => {
    const host = makeHost({ tasks: [task({ id: 'q1', title: 'Fix up outdoor spaces', bucket: 'quarter' })] })
    renderStep(<ReviewStep />, { step: seasonStep, host, horizon: 'seasonal' })
    fireEvent.click(screen.getByRole('button', { name: /Change/ }))
    const input = screen.getByRole('textbox', { name: 'Edit item' })
    fireEvent.change(input, { target: { value: 'Fix up the front porch' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.onUpdateTask).toHaveBeenCalledWith('q1', { title: 'Fix up the front porch' })
  })

  it('Carry into this season re-picks the item (writes pickedAt) without touching its goalId', () => {
    const host = makeHost({ tasks: [task({ id: 'q1', title: 'Fix up outdoor spaces', bucket: 'quarter', goalId: 'g1' })] })
    renderStep(<ReviewStep />, { step: seasonStep, host, horizon: 'seasonal' })
    fireEvent.click(screen.getByRole('button', { name: /Carry into this season/ }))
    // Re-picks for the new season by stamping a fresh pickedAt…
    expect(host.onUpdateTask).toHaveBeenCalledWith('q1', { pickedAt: expect.any(Date) })
    // …and preserves goalId by omission — it is never part of the update payload.
    expect(host.onUpdateTask).not.toHaveBeenCalledWith('q1', expect.objectContaining({ goalId: expect.anything() }))
    // Row stays visible with a Carried tag instead of vanishing mid-step.
    expect(screen.getByText('Fix up outdoor spaces')).toBeInTheDocument()
    expect(screen.getByText('Carried')).toBeInTheDocument()
  })
})

describe('ReviewStep — someday source', () => {
  const somedayStep = {
    id: 'annual-someday', type: 'review' as const, title: 'Someday list',
    narration: 'Still someday, or ready to move?',
    props: { source: 'someday' as const },
  }

  it('lists open items in the someday bucket', () => {
    const host = makeHost({ tasks: [task({ id: 'b', title: 'Learn pottery', bucket: 'someday' })] })
    renderStep(<ReviewStep />, { step: somedayStep, host })
    expect(screen.getByText('Learn pottery')).toBeInTheDocument()
  })
})

describe('ReviewStep — overdue source', () => {
  const overdueStep = {
    id: 'daily-overdue', type: 'review' as const, title: 'Overdue',
    narration: 'Still worth doing, or let go?',
    props: { source: 'overdue' as const },
  }

  it('lists overdue items via selectOverdue', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const host = makeHost({ tasks: [task({ id: 'c', title: 'Call plumber', bucket: 'timed', scheduledFor: yesterday })] })
    renderStep(<ReviewStep />, { step: overdueStep, host })
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
  })
})

describe('ReviewStep — goals source', () => {
  const goalsStep = {
    id: 'goal-review', type: 'review' as const, title: 'Last year’s goals',
    narration: 'Achieved, carry, or let go.', props: { source: 'goals' as const },
  }
  const goal = { id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'ar1' } as unknown as Goal

  it('marks a goal achieved', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Achieved/ }))
    expect(host.updateGoalStatus).toHaveBeenCalledWith('g1', 'completed')
  })

  it('lets a goal go (archived)', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Let go/ }))
    expect(host.updateGoalStatus).toHaveBeenCalledWith('g1', 'archived')
  })

  it('carries a goal forward into the year being planned', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Carry forward/ }))
    expect(host.carryGoal).toHaveBeenCalledWith('g1')
  })

  it('a verdicted goal stays on screen showing its fate instead of vanishing', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Carry forward/ }))
    // Row remains, now read-only with the fate label; action buttons are gone.
    expect(screen.getByText('Run a 5k')).toBeInTheDocument()
    expect(screen.getByText('Carried forward')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Achieved/ })).toBeNull()
  })

  it('shows the empty state when no goals are waiting on a verdict', () => {
    renderStep(<ReviewStep />, { step: goalsStep })
    expect(screen.getByText(/No goals waiting on a verdict/)).toBeInTheDocument()
  })
})

describe('ReviewStep — month grain hint', () => {
  it('flags a week-sized month item and pushes it to the week in one tap', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Weed the backyard', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    expect(screen.getByText(/one sitting/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Push "Weed the backyard" to the week' }))
    expect(host.onSetBucket).toHaveBeenCalledWith('a', 'week')
  })

  it('collapses a project cluster into ONE row with a bulk push, not N repeated hints', () => {
    const onSetBucket = vi.fn()
    const host = makeHost({
      tasks: ['Measure the gap', 'Compare two models', 'Sign the quote'].map((title, i) =>
        task({ id: `c${i}`, title, bucket: 'month', projectId: 'p1' })),
      projectsMap: new Map([['p1', { id: 'p1', name: 'Kitchen' }]]) as never,
      onSetBucket,
    })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    // One line for the cluster; the members are not listed.
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.queryByText('Measure the gap')).not.toBeInTheDocument()
    expect(screen.getByText(/one move, three week steps/i)).toBeInTheDocument()
    // One action, at the cluster's grain.
    fireEvent.click(screen.getByRole('button', { name: /push all 3 to the week/i }))
    expect(onSetBucket).toHaveBeenCalledTimes(3)
    expect(onSetBucket).toHaveBeenCalledWith('c0', 'week')
    expect(onSetBucket).toHaveBeenCalledWith('c2', 'week')
  })

  it('the cluster opens up when you want the individual fates', () => {
    const host = makeHost({
      tasks: ['Measure the gap', 'Compare two models', 'Sign the quote'].map((title, i) =>
        task({ id: `c${i}`, title, bucket: 'month', projectId: 'p1' })),
      projectsMap: new Map([['p1', { id: 'p1', name: 'Kitchen' }]]) as never,
    })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    fireEvent.click(screen.getByRole('button', { name: /show the 3/i }))
    expect(screen.getByText('Measure the gap')).toBeInTheDocument()
    // No repeated per-row cluster hint inside the expanded cluster.
    expect(screen.queryByText(/3 items on this project/i)).not.toBeInTheDocument()
  })

  it('says nothing about a month-sized item', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Decide what to do with the car', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    expect(screen.queryByText(/one sitting/i)).not.toBeInTheDocument()
  })

  it('leaves the week review alone — the hint is a month-altitude check', () => {
    const weekStep = { ...bucketStep, id: 'week-review', props: { bucket: 'week' as const } }
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Weed the backyard', bucket: 'week' })] })
    renderStep(<ReviewStep />, { step: weekStep, host, horizon: 'weekly' })
    expect(screen.queryByText(/one sitting/i)).not.toBeInTheDocument()
  })
})

// ── "Last week's list" means what has no claim on the week being planned. Before
// the placement cascade there was only ever one week, so `bucket === 'week'` was
// enough; now the month can place a move on a FUTURE week, and that must not turn
// up in a review of what you didn't finish. ──
describe('ReviewStep — week review scoping', () => {
  const weekStep = { id: 'week-review', type: 'review' as const, title: "Last week's list", props: { bucket: 'week' as const } }
  const weekOf = (d: number) => new Date(2026, 6, d)
  const planning = weekOf(19) // the week being planned

  function renderWeekReview(tasks: Task[]) {
    return renderStep(<ReviewStep />, {
      step: weekStep, host: makeHost({ tasks }), horizon: 'weekly', periodStart: planning,
    })
  }

  it('asks about a move left behind by an earlier week', () => {
    renderWeekReview([task({ id: 'a', title: 'Order the vanity', bucket: 'week', weekStart: weekOf(12) })])
    expect(screen.getByText('Order the vanity')).toBeInTheDocument()
  })

  it('asks about a legacy row that never got a week at all', () => {
    renderWeekReview([task({ id: 'a', title: 'Weed the backyard', bucket: 'week' })])
    expect(screen.getByText('Weed the backyard')).toBeInTheDocument()
  })

  it('does NOT ask about a move the month placed on a LATER week', () => {
    renderWeekReview([task({ id: 'a', title: 'Book the mover', bucket: 'week', weekStart: weekOf(26) })])
    expect(screen.queryByText('Book the mover')).not.toBeInTheDocument()
  })

  it('does NOT ask about a move deliberately placed on the week being planned', () => {
    renderWeekReview([task({ id: 'a', title: 'Get the plants', bucket: 'week', weekStart: planning })])
    expect(screen.queryByText('Get the plants')).not.toBeInTheDocument()
  })

  it('still scopes the MONTH review by bucket alone — a month has no week to miss', () => {
    const monthStep = { ...weekStep, id: 'month-review', props: { bucket: 'month' as const } }
    renderStep(<ReviewStep />, {
      step: monthStep,
      host: makeHost({ tasks: [task({ id: 'a', title: 'Decide on the car', bucket: 'month', weekStart: weekOf(26) })] }),
      horizon: 'monthly', periodStart: planning,
    })
    expect(screen.getByText('Decide on the car')).toBeInTheDocument()
  })
})

// ── "Migrate or release" promises three fates. It used to render the generic
// scheduling menu — Today/Week/Month/Someday + date + done + delete — so the
// one verb in the title wasn't a button anywhere, and keeping was the null
// action. (Scott, 2026-07-25: "i dont understand this page either".) ──
describe('ReviewStep — the month review offers the fates it names', () => {
  const monthStep = {
    id: 'month-review', type: 'review' as const, title: 'Migrate or release',
    narration: 'Migrate it or release it.',
    // Exactly the shipped config in sessions.ts — no `rows`, so this routes to
    // TaskTriageRow, the row Scott was looking at.
    props: { bucket: 'month' as const },
  }
  const open = () => makeHost({
    tasks: [task({ id: 'm1', title: 'Plan a winter vacation', bucket: 'month' })],
  })

  it('offers Keep, Done, Someday and Let go — and no scheduling pills', () => {
    renderStep(<ReviewStep />, { step: monthStep, host: open(), horizon: 'monthly' })
    expect(screen.getByRole('button', { name: /Keep/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Done/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Someday/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Let go/ })).toBeInTheDocument()
    // Placements belong to later rungs — place-on-weeks asks "which week".
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
  })

  it('Keep settles the row so the undecided list visibly shrinks', () => {
    renderStep(<ReviewStep />, { step: monthStep, host: open(), horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /Keep/ }))
    expect(screen.getByText('Kept')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Keep/ })).not.toBeInTheDocument()
  })

  it('Someday parks it — the timing was wrong, not the item', () => {
    const host = open()
    renderStep(<ReviewStep />, { step: monthStep, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /Someday/ }))
    expect(host.onSetBucket).toHaveBeenCalledWith('m1', 'someday')
  })

  it('Let go actually deletes — the narration promises a fate it can perform', () => {
    const host = open()
    renderStep(<ReviewStep />, { step: monthStep, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /Let go/ }))
    expect(host.onDeleteTask).toHaveBeenCalledWith('m1')
  })
})
