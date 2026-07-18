import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MealsTabs } from './MealsTabs'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MealsTabs />
    </MemoryRouter>,
  )
}

describe('MealsTabs', () => {
  it('renders Plan and Recipes tabs', () => {
    renderAt('/meals/plan')
    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recipes' })).toBeInTheDocument()
  })

  it('marks Recipes active on /meals/shelf', () => {
    renderAt('/meals/shelf')
    const recipes = screen.getByRole('button', { name: 'Recipes' })
    const plan = screen.getByRole('button', { name: 'Plan' })
    expect(recipes.className).toContain('border-primary-500')
    expect(plan.className).not.toContain('border-primary-500')
  })

  it('defaults to Plan active on /meals/plan', () => {
    renderAt('/meals/plan')
    expect(screen.getByRole('button', { name: 'Plan' }).className).toContain('border-primary-500')
  })
})
