import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { BetsGrid } from './BetsGrid'
import { OverflowTray } from './OverflowTray'
import { MonthStrip } from './MonthStrip'
import type { Task } from '@/types/task'

function bet(id: string, title: string, over: Partial<Task> = {}): Task {
  return { id, title, completed: false, createdAt: new Date(2026, 6, 1), bucket: 'quarter', ...over } as Task
}
const picked = (id: string, title: string, over: Partial<Task> = {}): Task =>
  bet(id, title, { pickedAt: new Date(2026, 6, 2), ...over })

describe('BetsGrid', () => {
  it('renders PICKED cards with goal provenance and starving state; bench items stay out of the grid', () => {
    const goals = new Map([['g1', { id: 'g1', name: 'Financial calm' } as never]])
    render(
      <BetsGrid
        tasks={[picked('b1', 'A money plan we follow', { goalId: 'g1' }), bet('b2', 'Benched idea')]}
        goalsById={goals}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        onDemote={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    expect(screen.getByText('A money plan we follow')).toBeInTheDocument()
    expect(screen.queryByText('Benched idea')).not.toBeInTheDocument()
    expect(screen.getByText(/Financial calm/)).toBeInTheDocument()
    expect(screen.getByText(/nothing this month/i)).toBeInTheDocument()
  })

  it('still renders a completed pick from this season instead of making it vanish', () => {
    render(
      <BetsGrid
        tasks={[picked('b1', 'A won pick this season', { completed: true })]}
        goalsById={new Map()}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        onDemote={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    expect(screen.getByText('A won pick this season')).toBeInTheDocument()
  })

  it('demote: the Bench action un-picks without selecting or completing', () => {
    const onSelect = vi.fn(); const onComplete = vi.fn(); const onDemote = vi.fn()
    render(
      <BetsGrid
        tasks={[picked('b1', 'A test pick')]}
        goalsById={new Map()} onSelect={onSelect} onComplete={onComplete} onDemote={onDemote}
        now={new Date(2026, 6, 20)}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /move to bench/i }))
    expect(onDemote).toHaveBeenCalledWith('b1')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('OverflowTray (the bench)', () => {
  it('renders Pick it plus the three exits; under the cap Pick it promotes directly', () => {
    const onPick = vi.fn()
    render(
      <OverflowTray items={[bet('b9', 'Get a rough outline of breaks')]}
        picks={[picked('p1', 'A pick')]}
        onPick={onPick} onSwap={vi.fn()}
        onMakeMove={vi.fn()} onShelf={vi.fn()} onLetGo={vi.fn()} />,
    )
    expect(screen.getByText('Get a rough outline of breaks')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /pick it/i }))
    expect(onPick).toHaveBeenCalledWith('b9')
    expect(screen.getByRole('button', { name: /month move/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shelf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /let it go/i })).toBeInTheDocument()
  })

  it('at the cap, Pick it opens the swap picker and swapping reports both ids', () => {
    const onPick = vi.fn(); const onSwap = vi.fn()
    const eightPicks = Array.from({ length: 8 }, (_, i) => picked(`p${i}`, `Pick ${i}`))
    render(
      <OverflowTray items={[bet('b9', 'The challenger')]}
        picks={eightPicks}
        onPick={onPick} onSwap={onSwap}
        onMakeMove={vi.fn()} onShelf={vi.fn()} onLetGo={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /pick it/i }))
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByText(/replace which pick/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pick 3' }))
    expect(onSwap).toHaveBeenCalledWith('b9', 'p3')
  })
})

describe('BetsGrid keyboard', () => {
  it('does not call onSelect when Enter is pressed on Mark Won button', () => {
    const onSelect = vi.fn()
    render(
      <BetsGrid
        tasks={[picked('b1', 'A test pick')]}
        goalsById={new Map()} onSelect={onSelect} onComplete={vi.fn()} onDemote={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: /mark won/i }), { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('MonthStrip', () => {
  it('shows progress bar with completed month-bucket tasks', () => {
    const tasks: Task[] = [
      { id: 't1', title: 'Completed month task', completed: true, bucket: 'month' as const, createdAt: new Date(2026, 6, 1), scheduledFor: null } as Task,
      { id: 't2', title: 'Open month task', completed: false, bucket: 'month' as const, createdAt: new Date(2026, 6, 2), scheduledFor: null } as Task,
    ]
    render(<MonthStrip tasks={tasks} onOpenMonth={vi.fn()} now={new Date(2026, 6, 20)} />)
    expect(screen.getByText('2 moves')).toBeInTheDocument()
    const cells = screen.getAllByRole('button')
    expect(cells.length).toBeGreaterThanOrEqual(1)
  })
})
