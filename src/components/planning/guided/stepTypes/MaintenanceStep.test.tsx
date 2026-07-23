import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MaintenanceStep } from './MaintenanceStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'

const STEP = { id: 'maintenance', type: 'maintenance' as const, title: 'Upkeep', narration: 'x'.repeat(30) }

describe('MaintenanceStep', () => {
  it('calls ensureUpkeepList on mount', () => {
    const host = makeHost()
    renderStep(<MaintenanceStep />, { step: STEP, host })
    expect(host.ensureUpkeepList).toHaveBeenCalledTimes(1)
  })

  it('adds a template item to the month atomically (bucket in options)', async () => {
    const host = makeHost({ upkeepItems: [{ id: 'i1', text: 'Paper & mail sweep' }] })
    renderStep(<MaintenanceStep />, { step: STEP, host })
    fireEvent.click(screen.getByRole('button', { name: /Add to month/i }))
    await waitFor(() =>
      expect(host.createTaskInBucket).toHaveBeenCalledWith('Paper & mail sweep', 'month'))
    // Row flips to on-state without waiting for host.tasks to refresh
    expect(screen.getByText(/On the list/)).toBeInTheDocument()
  })

  it('marks items already open on the month list (case-insensitive) and disables them', () => {
    const monthTask = { id: 't1', title: 'paper & MAIL sweep', completed: false, bucket: 'month' } as Task
    const host = makeHost({
      tasks: [monthTask],
      upkeepItems: [{ id: 'i1', text: 'Paper & mail sweep' }],
    })
    renderStep(<MaintenanceStep />, { step: STEP, host })
    expect(screen.getByText(/On the list/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to month/i })).not.toBeInTheDocument()
    expect(host.createTaskInBucket).not.toHaveBeenCalled()
  })

  it('shows a loading line while the template loads', () => {
    const host = makeHost({ upkeepLoading: true })
    renderStep(<MaintenanceStep />, { step: STEP, host })
    expect(screen.getByText(/Loading your upkeep list/)).toBeInTheDocument()
  })
})
