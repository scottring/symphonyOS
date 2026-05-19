// src/components/layout/Sidebar.nav.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { Sidebar } from './Sidebar'

function setup(onViewChange = vi.fn()) {
  render(
    <Sidebar
      collapsed={false}
      onToggle={() => {}}
      activeView="today"
      onViewChange={onViewChange}
      userName="Scott"
      onSignOut={() => {}}
    />
  )
  return { onViewChange }
}

describe('Sidebar primary nav', () => {
  it('shows Today, Meals, Family, Home as always-visible items', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Meals' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Family' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('Family routes to the home-app view', async () => {
    const { onViewChange } = setup()
    const user = (await import('@testing-library/user-event')).default.setup()
    await user.click(screen.getByRole('button', { name: 'Family' }))
    expect(onViewChange).toHaveBeenCalledWith('home-app')
  })

  it('does not render This Week or Calendar nav items in Layer 1', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'This Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument()
  })
})
