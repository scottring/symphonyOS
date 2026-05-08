import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarGroup } from './SidebarGroup'

describe('SidebarGroup', () => {
  it('renders the label and is closed by default', () => {
    render(
      <SidebarGroup label="Plan" open={false} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByRole('button', { name: /plan/i })).toBeInTheDocument()
    expect(screen.queryByText('Projects')).not.toBeInTheDocument()
  })

  it('renders children when open', () => {
    render(
      <SidebarGroup label="Plan" open={true} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('clicking the header calls onToggle', () => {
    const onToggle = vi.fn()
    render(
      <SidebarGroup label="Plan" open={false} onToggle={onToggle}>
        <button>Projects</button>
      </SidebarGroup>
    )
    fireEvent.click(screen.getByRole('button', { name: /plan/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('forceOpen overrides open=false and renders children', () => {
    render(
      <SidebarGroup label="Plan" open={false} forceOpen onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('when collapsed=true, renders only children (no header)', () => {
    render(
      <SidebarGroup label="Plan" open={false} onToggle={vi.fn()} collapsed>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.queryByRole('button', { name: /plan/i })).not.toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('aria-expanded reflects open state', () => {
    const { rerender } = render(
      <SidebarGroup label="Plan" open={false} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByRole('button', { name: /plan/i })).toHaveAttribute('aria-expanded', 'false')
    rerender(
      <SidebarGroup label="Plan" open={true} onToggle={vi.fn()}>
        <button>Projects</button>
      </SidebarGroup>
    )
    expect(screen.getByRole('button', { name: /plan/i })).toHaveAttribute('aria-expanded', 'true')
  })
})
