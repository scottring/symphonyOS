import { describe, it, expect } from 'vitest'
import { selectRefileRows } from './refile'
import type { Task } from '@/types/task'
const t = (o: Partial<Task>) => ({ id: Math.random().toString(), title: 't', completed: false, bucket: 'inbox', createdAt: new Date(), updatedAt: new Date(), userId: 'me', ...o }) as Task

describe('selectRefileRows', () => {
  it('finds my open family/individual and work-or-personal/compound rows only', () => {
    const rows = selectRefileRows([
      t({ context: 'family', scope: 'individual' }),
      t({ context: 'personal', scope: 'compound' }),
      t({ context: 'family', scope: 'compound' }),
      t({ context: 'family', scope: 'individual', completed: true }),
      t({ context: 'family', scope: 'individual', userId: 'iris' }),
      t({ context: null, scope: 'individual' }),
    ], 'me')
    expect(rows.map((r) => r.kind)).toEqual(['family-private', 'private-shared'])
  })

  it('returns nothing when there is no current user', () => {
    const rows = selectRefileRows([t({ context: 'family', scope: 'individual' })], null)
    expect(rows).toEqual([])
  })

  it('sorts oldest first by createdAt', () => {
    const older = t({ context: 'family', scope: 'individual', createdAt: new Date('2026-01-01') })
    const newer = t({ context: 'family', scope: 'individual', createdAt: new Date('2026-02-01') })
    const rows = selectRefileRows([newer, older], 'me')
    expect(rows.map((r) => r.task)).toEqual([older, newer])
  })
})
