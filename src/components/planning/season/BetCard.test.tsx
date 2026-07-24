import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { BetCard } from './BetCard'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

const pick = (id: string, title: string, over: Partial<Task> = {}): Task =>
  ({ id, title, completed: false, createdAt: new Date(2026, 6, 1), bucket: 'quarter', pickedAt: new Date(2026, 6, 2), ...over }) as Task

describe('BetCard goal breadcrumb', () => {
  it('renders a ← goal breadcrumb when the pick carries a resolvable goalId', () => {
    const goals = new Map<string, Goal>([['g1', { id: 'g1', name: 'Financial calm' } as Goal]])
    render(
      <BetCard
        bet={pick('b1', 'A money plan we follow', { goalId: 'g1' })}
        tasks={[]}
        goalsById={goals}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        onDemote={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    expect(screen.getByText(/←\s*Financial calm/)).toBeInTheDocument()
  })

  it('shows the seasonal fallback and no breadcrumb when the goalId does not resolve', () => {
    render(
      <BetCard
        bet={pick('b1', 'A standalone pick')}
        tasks={[]}
        goalsById={new Map()}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        onDemote={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    expect(screen.getByText('seasonal')).toBeInTheDocument()
    expect(screen.queryByText(/←/)).not.toBeInTheDocument()
  })
})
