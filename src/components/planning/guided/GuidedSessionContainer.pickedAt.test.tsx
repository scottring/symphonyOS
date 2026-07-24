import { describe, it, expect } from 'vitest'
// The container's createTaskInBucket is a thin wrapper over addTask. This test
// asserts pickedAt is forwarded. If the container is hard to mount in isolation,
// assert at the unit boundary: extract the opts-mapping into a tested pure fn.
import { buildAddTaskOptions } from './GuidedSessionContainer'

describe('createTaskInBucket options mapping', () => {
  it('forwards pickedAt into addTask options', () => {
    const d = new Date('2026-07-24T00:00:00Z')
    const opts = buildAddTaskOptions('quarter', { goalId: 'g1', pickedAt: d }, 'family')
    expect(opts.pickedAt).toBe(d)
    expect(opts.goalId).toBe('g1')
    expect(opts.bucket).toBe('quarter')
    expect(opts.context).toBe('family')
  })
})
