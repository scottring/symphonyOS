import { describe, it, expect } from 'vitest'
import { filterTasksForLayers } from './domainFilter'
import { makeAssigneeFilter } from './assigneeFilter'
import { UNSORTED, type Layer } from '@/lib/domains'
import type { Task } from '@/types/task'

// The reported bug: Scott and Iris opened the same day and saw two different
// family agendas, from rows BOTH could already fetch. Two separate filters were
// each narrowing by person — the domain filter's assignee-keyed "privacy"
// check, and an assignee filter seeded to [me] on first load.
//
// The rule now: the context chooser answers WHAT PART OF LIFE and nothing else.
// Who can see an item is `scope` (RLS, 2026-06-07_scope_axis.sql:34); who
// should DO it is the assignee filter, which is opt-in and defaults to
// everyone.

const task = (o: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2),
  title: 't',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...o,
} as Task)

const SCOTT = 'member-scott'
const IRIS = 'member-iris'
const ELLA = 'member-ella'

/** A household day as it arrives from the DB — RLS has already run. */
const household = [
  task({ id: 'feed-jax', context: 'family', assignedTo: ELLA }),
  task({ id: 'kitchen', context: 'family', assignedToAll: [IRIS, ELLA] }),
  task({ id: 'laundry', context: 'family', assignedTo: SCOTT }),
  task({ id: 'mold', context: 'family' }),
  task({ id: 'my-work', context: 'work', assignedTo: SCOTT }),
  task({ id: 'her-shared-personal', context: 'personal', assignedTo: IRIS }),
  task({ id: 'untagged', context: null }),
]

/** What a surface renders: the layer filter, then the assignee lens. */
function visible(layers: ReadonlySet<Layer>, assignees: string[]) {
  const match = makeAssigneeFilter(assignees)
  return filterTasksForLayers(household, layers)
    .filter((t) => match(t.assignedTo, t.assignedToAll))
    .map((t) => t.id)
}

const L = (...xs: Layer[]) => new Set<Layer>(xs)

describe('the family layer shows the whole household', () => {
  it('shows every family item regardless of who it belongs to', () => {
    // Default filter is everyone — [] — for both people. Unsorted is checked
    // too, matching the app default (every layer checked).
    expect(visible(L('family', UNSORTED), [])).toEqual(['feed-jax', 'kitchen', 'laundry', 'mold', 'untagged'])
  })

  it('gives two members of one household the SAME family day', () => {
    expect(visible(L('family'), [])).toEqual(visible(L('family'), []))
    // The bug in one line: seeded to [me], each saw a different subset.
    expect(visible(L('family'), [SCOTT])).not.toEqual(visible(L('family'), [IRIS]))
  })

  it('keeps unassigned household work visible — it is the easiest to drop', () => {
    expect(visible(L('family'), [])).toContain('mold')
  })
})

describe('narrowing to a person stays available', () => {
  it('is an opt-in lens, not the default', () => {
    expect(visible(L('family'), [ELLA])).toEqual(['feed-jax', 'kitchen'])
    expect(visible(L('family'), [SCOTT])).toEqual(['laundry'])
  })

  it('ORs "unassigned" with the named members instead of replacing them', () => {
    // The Inbox's old local copy returned early on 'unassigned' and dropped
    // every named member from the selection.
    expect(visible(L('family', UNSORTED), [ELLA, 'unassigned']))
      .toEqual(['feed-jax', 'kitchen', 'mold', 'untagged'])
  })
})

describe('other layers behave the same way — RLS is the privacy gate', () => {
  it('does not hide an item just because someone else is assigned', () => {
    // 'her-shared-personal' only reached this client because its scope is
    // couple/compound — she chose to share it. The view must not re-hide it.
    expect(visible(L('personal'), [])).toEqual(['her-shared-personal'])
    expect(visible(L('work'), [])).toEqual(['my-work'])
  })

  it('every layer checked shows the lot', () => {
    expect(visible(L('work', 'family', 'personal', UNSORTED), [])).toHaveLength(household.length)
  })
})

// The layer rule (replaces the old single-domain "untagged shows in every
// domain" rule): untagged is the Unsorted layer, a real layer like any other —
// it shows iff Unsorted is checked, and is hidden otherwise.
describe('untagged items are the Unsorted layer, not "everywhere"', () => {
  it('untagged is hidden from a domain when Unsorted is unchecked', () => {
    expect(visible(L('family'), [])).not.toContain('untagged')
    expect(visible(L('personal'), [])).not.toContain('untagged')
  })

  it('untagged shows once Unsorted is checked, alongside whatever else is checked', () => {
    expect(visible(L(UNSORTED), [])).toEqual(['untagged'])
    expect(visible(L('family', UNSORTED), [])).toContain('untagged')
  })
})
