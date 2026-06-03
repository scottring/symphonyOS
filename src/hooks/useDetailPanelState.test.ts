import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDetailPanelState } from './useDetailPanelState'
import type { Routine } from '@/types/actionable'

function makeRoutine(overrides: Partial<Routine>): Routine {
  return {
    id: 'r1',
    user_id: 'u1',
    name: 'Kids shower routine',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    recurrence_pattern: { type: 'weekly', days: ['mon', 'wed', 'sat'] },
    time_of_day: '19:00:00',
    raw_input: null,
    show_on_timeline: true,
    created_at: '2025-12-04T00:00:00.000Z',
    updated_at: '2026-05-25T00:00:00.000Z',
    ...overrides,
  }
}

// Minimal no-op params shared across cases — the hook needs all of them, but
// these tests only exercise the routine-lookup branch of `selectedItem`.
const baseParams = {
  tasks: [],
  events: [],
  viewedDate: new Date('2026-06-03T12:00:00'),
  dateInstances: [],
  getNote: () => undefined,
  eventNotesMap: new Map(),
  contactsMap: new Map(),
  projectsMap: new Map(),
  getLinkedTasks: () => ({ prep: [], followup: [] }),
  fetchNote: () => {},
  fetchAttachments: async () => [],
  getAttachments: () => [],
} as const

describe('useDetailPanelState — routine lookup', () => {
  it('resolves a selected routine from allRoutines (active)', () => {
    const routine = makeRoutine({ id: 'r1', visibility: 'active' })
    const { result } = renderHook(() =>
      useDetailPanelState({
        ...baseParams,
        selectedItemId: 'routine-r1',
        allRoutines: [routine],
      }),
    )
    expect(result.current.selectedItem).not.toBeNull()
    expect(result.current.selectedItem!.type).toBe('routine')
  })

  it('still resolves a selected routine after it flips to "reference" (regression: panel must not blank)', () => {
    // The bug: the panel looked up routines in `activeRoutines` only, so flipping
    // the open routine to reference visibility (which removes it from the active
    // set) made selectedItem null and blanked the whole panel.
    const reference = makeRoutine({ id: 'r1', visibility: 'reference' })
    const { result } = renderHook(() =>
      useDetailPanelState({
        ...baseParams,
        selectedItemId: 'routine-r1',
        allRoutines: [reference],
      }),
    )
    expect(result.current.selectedItem).not.toBeNull()
    expect(result.current.selectedItem!.type).toBe('routine')
    expect(result.current.selectedItemRoutine?.visibility).toBe('reference')
  })
})
