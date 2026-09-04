import { describe, it, expect } from 'vitest'

/**
 * The 406 that filled production's console on 2026-09-04.
 *
 * PostgREST's `single()` sends `Accept: application/vnd.pgrst.object+json`,
 * which demands exactly one row and answers 406 Not Acceptable when it gets
 * none. So "this user has no calendar connection" — including the very common
 * case of a session whose JWT no longer resolves, where RLS simply hides the
 * row — arrived as an ERROR.
 *
 * useGoogleCalendar treats a connection-read error as "the read failed, try
 * again", so it retried on a schedule while the answer was never going to
 * change. `maybeSingle()` returns `{ data: null, error: null }` for no rows,
 * which is what the surrounding code already says it wants.
 *
 * This guards the choice at the source, since the behaviour lives in a network
 * accessor that a component test would have to mock into meaninglessness.
 */
describe('calendar connection read — maybeSingle, not single', () => {
  it('asks for maybeSingle so "no connection" is an answer, not an error', async () => {
    const src = await import('./useGoogleCalendar.tsx?raw').then((m) => m.default as string)
    const read = src.slice(src.indexOf("from('calendar_connections')"))
    const call = read.slice(0, read.indexOf('\n\n'))
    expect(call).toContain('.maybeSingle()')
    expect(call).not.toContain('.single()')
  })

  it('still retries a genuinely failed read, and only that', async () => {
    const src = await import('./useGoogleCalendar.tsx?raw').then((m) => m.default as string)
    expect(src).toContain('if (connError) scheduleRetry()')
  })
})
