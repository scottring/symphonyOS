import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sharedLoad, __resetSharedLoads } from './sharedLoad'

describe('sharedLoad', () => {
  beforeEach(() => __resetSharedLoads())

  it('callers that ask while a load is in flight share one trip', async () => {
    const load = vi.fn(async () => ['row'])
    const [a, b, c] = await Promise.all([sharedLoad('contacts:u1', load), sharedLoad('contacts:u1', load), sharedLoad('contacts:u1', load)])
    expect(load).toHaveBeenCalledTimes(1)
    expect(a).toEqual(['row']); expect(b).toBe(a); expect(c).toBe(a)
  })

  it('different keys load separately', async () => {
    const load = vi.fn(async () => 1)
    await Promise.all([sharedLoad('contacts:u1', load), sharedLoad('contacts:u2', load)])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a finished load is never reused: the next ask goes back to the database', async () => {
    const load = vi.fn(async () => 1)
    await sharedLoad('lists:u1', load)
    await sharedLoad('lists:u1', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a failed load is shared too, then cleared so a retry runs', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok')
    const results = await Promise.allSettled([sharedLoad('k', load), sharedLoad('k', load)])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(load).toHaveBeenCalledTimes(1)
    await expect(sharedLoad('k', load)).resolves.toBe('ok')
  })
})
