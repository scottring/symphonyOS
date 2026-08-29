// src/components/planning/guided/stepTypes/testHarness.tsx
// Renders a step component inside a GuidedProvider with sensible defaults.
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { ReactElement } from 'react'
import { GuidedProvider, type GuidedHost, type GuidedValue } from '../GuidedContext'
import type { GuidedStepConfig } from '../types'

export function makeHost(overrides: Partial<GuidedHost> = {}): GuidedHost {
  // Default fetchEvents resolves with the same list passed as `events` —
  // CalendarStep reads the fetchEvents return value (not `host.events`) to
  // avoid clobbering the app-wide calendar cache, so keep the two in sync
  // for tests that only set `events`.
  const events = overrides.events ?? []
  return {
    tasks: [], tasksLoading: false, events, calendarConnected: false, calendarChecking: false,
    fetchEvents: vi.fn(async () => events), createEvent: vi.fn(async () => {}),
    onPushTask: vi.fn(), onSetBucket: vi.fn(), onCompleteTask: vi.fn(), onDeleteTask: vi.fn(), onUpdateTask: vi.fn(),
    createTaskInBucket: vi.fn(async () => {}), createDatedTask: vi.fn(async () => {}),
    projects: [], projectsMap: new Map(),
    goals: [], goalAreas: [], addGoal: vi.fn(async () => null), addArea: vi.fn(async () => null),
    updateGoalStatus: vi.fn(async () => {}),
    carryGoal: vi.fn(async () => {}),
    routines: [], draggableRoutines: [], onScheduleRoutine: vi.fn(), getRoutinesForDate: () => [],
    upkeepItems: [], upkeepLoading: false, ensureUpkeepList: vi.fn(async () => {}),
    ...overrides,
  }
}

export function renderStep(
  ui: ReactElement,
  {
    step,
    host = makeHost(),
    notes = {},
    patchNotes = vi.fn(),
    horizon = 'monthly' as const,
    domain = null,
    goNext = vi.fn(),
    periodStart = new Date(2026, 6, 1),
    periodEnd = new Date(2026, 6, 31, 23, 59, 59),
  }: {
    step: GuidedStepConfig
    host?: GuidedHost
    notes?: GuidedValue['notes']
    patchNotes?: GuidedValue['patchNotes']
    horizon?: GuidedValue['horizon']
    domain?: GuidedValue['domain']
    goNext?: () => void
    periodStart?: Date
    periodEnd?: Date
  },
) {
  const value: GuidedValue = {
    horizon, domain, periodToken: '2026-7', periodLabel: 'July 2026',
    periodStart, periodEnd,
    notes, patchNotes, host, step, goNext,
  }
  return { ...render(<GuidedProvider value={value}>{ui}</GuidedProvider>), value }
}
