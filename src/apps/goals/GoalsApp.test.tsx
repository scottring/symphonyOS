import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Goal } from '@/types/goal'
import { ALL_LAYERS } from '@/lib/domains'
import { GoalsApp } from './GoalsApp'

// GoalsContext now fetches every year's goals (the year page needs last year
// and next year). /goals must still show only THIS year's goals — regression
// test for the year filter added to GoalsIndex.
const now = new Date()
const thisYearGoal: Goal = {
  id: 'g1', areaId: 'a1', name: 'This year', year: now.getFullYear(), status: 'active',
  sortOrder: 0, actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(), context: null,
} as Goal
const otherYearGoal: Goal = {
  id: 'g2', areaId: 'a1', name: 'Other year', year: now.getFullYear() - 1, status: 'active',
  sortOrder: 0, actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(), context: null,
} as Goal

vi.mock('@/contexts/GoalsContext', () => ({
  GoalsProvider: ({ children }: { children: React.ReactNode }) => children,
  useGoalsContext: () => ({
    goals: [thisYearGoal, otherYearGoal],
    areas: [{ id: 'a1', name: 'General' }],
    loading: false,
    addArea: vi.fn(),
    updateArea: vi.fn(),
    deleteArea: vi.fn(),
    addGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    getGoalById: vi.fn(),
  }),
}))

vi.mock('@/hooks/useDomain', () => ({
  useDomain: () => ({ layers: ALL_LAYERS, soleDomain: null }),
}))

describe('GoalsApp', () => {
  it('shows only the current year\'s goals on /goals', async () => {
    // GoalsApp is mounted at "/goals/*" in the Shell; standalone here, its
    // own <Routes> resolves the index route against "/".
    render(
      <MemoryRouter initialEntries={['/']}>
        <GoalsApp />
      </MemoryRouter>,
    )

    expect(await screen.findByText('This year')).toBeInTheDocument()
    expect(screen.queryByText('Other year')).not.toBeInTheDocument()
  })
})
