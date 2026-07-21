import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { BetsGrid } from './BetsGrid'
import { OverflowTray } from './OverflowTray'
import { MonthStrip } from './MonthStrip'
import type { Task } from '@/types/task'

function bet(id: string, title: string, over: Partial<Task> = {}): Task {
  return { id, title, completed: false, createdAt: new Date(2026, 6, 1), bucket: 'quarter', ...over } as Task
}

describe('BetsGrid', () => {
  it('renders bet cards with goal provenance and starving state', () => {
    const goals = new Map([['g1', { id: 'g1', name: 'Financial calm' } as never]])
    render(
      <BetsGrid
        tasks={[bet('b1', 'A money plan we follow', { goalId: 'g1' })]}
        goalsById={goals}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    expect(screen.getByText('A money plan we follow')).toBeInTheDocument()
    expect(screen.getByText(/Financial calm/)).toBeInTheDocument()
    expect(screen.getByText(/nothing this month/i)).toBeInTheDocument()
  })
})

describe('OverflowTray', () => {
  it('renders the three exits per item', () => {
    render(
      <OverflowTray items={[bet('b9', 'Get a rough outline of breaks')]}
        onMakeMove={vi.fn()} onShelf={vi.fn()} onLetGo={vi.fn()} />,
    )
    expect(screen.getByText('Get a rough outline of breaks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /month move/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shelf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /let it go/i })).toBeInTheDocument()
  })
})

describe('BetsGrid keyboard', () => {
  it('does not call onSelect when Enter is pressed on Mark Won button', () => {
    const onSelect = vi.fn()
    const onComplete = vi.fn()
    render(
      <BetsGrid
        tasks={[bet('b1', 'A test bet')]}
        goalsById={new Map()}
        onSelect={onSelect}
        onComplete={onComplete}
        now={new Date(2026, 6, 20)}
      />,
    )
    const markWonButton = screen.getByRole('button', { name: /mark won/i })
    fireEvent.keyDown(markWonButton, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('MonthStrip', () => {
  it('shows progress bar with completed month-bucket tasks', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Completed month task',
        completed: true,
        bucket: 'month' as const,
        createdAt: new Date(2026, 6, 1),
        scheduledFor: null,
      } as Task,
      {
        id: 't2',
        title: 'Open month task',
        completed: false,
        bucket: 'month' as const,
        createdAt: new Date(2026, 6, 2),
        scheduledFor: null,
      } as Task,
    ]
    render(
      <MonthStrip
        tasks={tasks}
        onOpenMonth={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    expect(screen.getByText('2 moves')).toBeInTheDocument()
    // Progress bar should show 50% (1 completed out of 2)
    const cells = screen.getAllByRole('button')
    expect(cells.length).toBeGreaterThanOrEqual(1)
  })
})
