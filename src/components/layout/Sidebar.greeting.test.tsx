// src/components/layout/Sidebar.greeting.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { Sidebar } from './Sidebar'

const baseProps = {
  collapsed: false,
  onToggle: () => {},
  activeView: 'today' as const,
  onViewChange: () => {},
  userName: 'Scott Kaufman',
  userEmail: 'scott@example.com',
  onSignOut: () => {},
}

describe('Sidebar greeting + tagline', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows the time-of-day greeting with first name at the top', () => {
    vi.setSystemTime(new Date('2026-05-19T09:00:00'))
    render(<Sidebar {...baseProps} />)
    expect(screen.getByText('Good morning, Scott')).toBeInTheDocument()
  })

  it('renders the tagline', () => {
    vi.setSystemTime(new Date('2026-05-19T09:00:00'))
    render(<Sidebar {...baseProps} />)
    expect(
      screen.getByText('Everything in one place, so life flows better.')
    ).toBeInTheDocument()
  })

  it('hides greeting + tagline when collapsed', () => {
    vi.setSystemTime(new Date('2026-05-19T09:00:00'))
    render(<Sidebar {...baseProps} collapsed />)
    expect(screen.queryByText('Good morning, Scott')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Everything in one place, so life flows better.')
    ).not.toBeInTheDocument()
  })
})
