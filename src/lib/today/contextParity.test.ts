import { describe, it, expect } from 'vitest'
import { filterTasksForDomainView } from './domainFilter'
import { makeAssigneeFilter } from './assigneeFilter'
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

/** What a surface renders: domain filter, then the assignee lens. */
function visible(domain: 'family' | 'work' | 'personal' | 'universal', assignees: string[]) {
  const match = makeAssigneeFilter(assignees)
  return filterTasksForDomainView(household, domain)
    .filter((t) => match(t.assignedTo, t.assignedToAll))
    .map((t) => t.id)
}

describe('the family chooser shows the whole household', () => {
  it('shows every family item regardless of who it belongs to', () => {
    // Default filter is everyone — [] — for both people.
    expect(visible('family', [])).toEqual(['feed-jax', 'kitchen', 'laundry', 'mold', 'untagged'])
  })

  it('gives two members of one household the SAME family day', () => {
    expect(visible('family', [])).toEqual(visible('family', []))
    // The bug in one line: seeded to [me], each saw a different subset.
    expect(visible('family', [SCOTT])).not.toEqual(visible('family', [IRIS]))
  })

  it('keeps unassigned household work visible — it is the easiest to drop', () => {
    // makeAssigneeFilter([me]) returns false for an unassigned item, so the old
    // default hid every unclaimed chore.
    expect(visible('family', [])).toContain('mold')
  })
})

describe('narrowing to a person stays available', () => {
  it('is an opt-in lens, not the default', () => {
    expect(visible('family', [ELLA])).toEqual(['feed-jax', 'kitchen'])
    expect(visible('family', [SCOTT])).toEqual(['laundry'])
  })

  it('ORs "unassigned" with the named members instead of replacing them', () => {
    // The Inbox's old local copy returned early on 'unassigned' and dropped
    // every named member from the selection.
    // 'untagged' is unassigned too, and untagged items show in every domain.
    expect(visible('family', [ELLA, 'unassigned']))
      .toEqual(['feed-jax', 'kitchen', 'mold', 'untagged'])
  })
})

describe('other contexts behave the same way — RLS is the privacy gate', () => {
  it('does not hide an item just because someone else is assigned', () => {
    // 'her-shared-personal' only reached this client because its scope is
    // couple/compound — she chose to share it. The view must not re-hide it.
    expect(visible('personal', [])).toEqual(['her-shared-personal', 'untagged'])
    expect(visible('work', [])).toEqual(['my-work', 'untagged'])
  })

  it('universal shows the lot', () => {
    expect(visible('universal', [])).toHaveLength(household.length)
  })
})
