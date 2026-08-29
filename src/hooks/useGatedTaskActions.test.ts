import { describe, it, expect, vi } from 'vitest'
import { needsDomain, gateUpdate } from './useGatedTaskActions'

const unsorted = { id: 't', title: 'x', context: null } as never
const tagged = { id: 't', title: 'x', context: 'work' } as never

describe('needsDomain', () => {
  it('scheduling, bucketing, assigning, or projecting an Unsorted task needs a domain', () => {
    expect(needsDomain(unsorted, { scheduledFor: new Date() })).toBe(true)
    expect(needsDomain(unsorted, { bucket: 'week' })).toBe(true)
    expect(needsDomain(unsorted, { assignedToAll: ['m'] })).toBe(true)
    expect(needsDomain(unsorted, { projectId: 'p' })).toBe(true)
  })
  it('does not fire for a tagged task, a title edit, or an update that carries its own context', () => {
    expect(needsDomain(tagged, { scheduledFor: new Date() })).toBe(false)
    expect(needsDomain(unsorted, { title: 'y' })).toBe(false)
    expect(needsDomain(unsorted, { scheduledFor: new Date(), context: 'family' })).toBe(false)
  })
})

describe('gateUpdate', () => {
  it('asks, then writes the update WITH the chosen domain; cancel writes nothing', async () => {
    const write = vi.fn()
    await gateUpdate(unsorted, { bucket: 'week' }, async () => 'family', write)
    expect(write).toHaveBeenCalledWith('t', { bucket: 'week', context: 'family' })
    write.mockClear()
    await gateUpdate(unsorted, { bucket: 'week' }, async () => null, write)
    expect(write).not.toHaveBeenCalled()
  })
})
