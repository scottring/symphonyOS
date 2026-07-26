import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shareInFlight, __resetSharedRequests } from './sharedRequest'

describe('shareInFlight', () => {
  beforeEach(() => __resetSharedRequests())

  it('runs one request for concurrent callers with the same key', async () => {
    const run = vi.fn(async () => 'rows')
    const [a, b, c] = await Promise.all([
      shareInFlight('projects', run),
      shareInFlight('projects', run),
      shareInFlight('projects', run),
    ])
    expect(run).toHaveBeenCalledTimes(1)
    expect([a, b, c]).toEqual(['rows', 'rows', 'rows'])
  })

  it('keeps different keys apart', async () => {
    const run = vi.fn(async () => 'x')
    await Promise.all([shareInFlight('projects', run), shareInFlight('notes', run)])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does NOT cache — a caller after the request settles gets a fresh one', async () => {
    const run = vi.fn(async () => 'x')
    await shareInFlight('projects', run)
    await shareInFlight('projects', run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('a rejection is shared, and does not poison the next caller', async () => {
    const boom = vi.fn(async () => { throw new Error('nope') })
    await expect(Promise.all([
      shareInFlight('projects', boom),
      shareInFlight('projects', boom),
    ])).rejects.toThrow('nope')
    expect(boom).toHaveBeenCalledTimes(1)

    const ok = vi.fn(async () => 'recovered')
    await expect(shareInFlight('projects', ok)).resolves.toBe('recovered')
  })
})
