import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { BetsGrid } from './BetsGrid'
import { OverflowTray } from './OverflowTray'
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
