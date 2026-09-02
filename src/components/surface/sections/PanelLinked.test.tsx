import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelLinked } from './PanelLinked'
import { createMockTask } from '@/test/mocks/factories'

describe('PanelLinked', () => {
  const handlers = {
    onOpenEvent: vi.fn(),
    onOpenTask: vi.fn(),
  }

  it('renders nothing when no links', () => {
    const { container } = render(<PanelLinked siblingTasks={[]} {...handlers} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders linked event title and time', () => {
    render(<PanelLinked
      linkedEvent={{ id: 'e1', title: 'Annual physical', start_time: '2026-05-14T09:00:00Z' } as any}
      siblingTasks={[]}
      {...handlers}
    />)
    expect(screen.getByText('Annual physical')).toBeInTheDocument()
  })

  it('renders sibling tasks', () => {
    const sib = createMockTask({ id: 't9', title: 'Refill rx' })
    render(<PanelLinked siblingTasks={[sib]} {...handlers} />)
    expect(screen.getByText('Refill rx')).toBeInTheDocument()
  })

  // The parent-project row was the first thing this section drew until Projects
  // were hidden from the product (2026-09-02 — see the note in Sidebar.tsx).
  // "Linked" is the event and the siblings now; a task carries its own context.
})
