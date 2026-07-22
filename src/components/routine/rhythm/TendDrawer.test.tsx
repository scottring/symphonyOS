import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TendDrawer } from './TendDrawer'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const base = {
  open: true,
  onClose: vi.fn(),
  findings: [],
  routines: [] as Routine[],
  sleepers: [] as Routine[],
  onDismiss: vi.fn(),
  onMerge: vi.fn(),
  onStampDomain: vi.fn(),
  onRename: vi.fn(),
  onLetGo: vi.fn(),
  onWakeAll: vi.fn(),
  onOpenRoutine: vi.fn(),
}

describe('TendDrawer', () => {
  it('renders nothing when closed', () => {
    render(<TendDrawer {...base} open={false} />)
    expect(screen.queryByText(/tend/i)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is nothing to tend', () => {
    render(<TendDrawer {...base} />)
    expect(screen.getByText(/nothing to tend/i)).toBeInTheDocument()
  })

  it('renders the sleeping section with wake-all', () => {
    const onWakeAll = vi.fn()
    render(<TendDrawer {...base} sleepers={[mk({ name: 'Walk kids to school', visibility: 'reference' })]}
      onWakeAll={onWakeAll} />)
    expect(screen.getByText(/walk kids to school/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /wake all/i }))
    expect(onWakeAll).toHaveBeenCalled()
  })
})
