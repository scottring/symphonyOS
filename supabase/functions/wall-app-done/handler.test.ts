import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny stand-in for the two tables the function touches.
const db = vi.hoisted(() => ({
  routines: [] as Record<string, unknown>[],
  instances: [] as Record<string, unknown>[],
  serve: vi.fn(),
}))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = []
      const rows = () => (table === 'routines' ? db.routines : db.instances).filter((r) => filters.every(([k, v]) => r[k] === v))
      const q = {
        select: () => q,
        ilike: () => Promise.resolve({ data: db.routines, error: null }),
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q },
        limit: () => Promise.resolve({ data: rows(), error: null }),
        insert: (row: Record<string, unknown>) => { db.instances.push({ id: `i${db.instances.length}`, ...row }); return Promise.resolve({ error: null }) },
        update: (patch: Record<string, unknown>) => ({ eq: (_k: string, id: unknown) => { Object.assign(db.instances.find((r) => r.id === id)!, patch); return Promise.resolve({ error: null }) } }),
      }
      return q
    },
  }),
}))

let handler: (request: Request) => Promise<Response>
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T16:00:00Z'))
  vi.stubGlobal('Deno', {
    serve: db.serve,
    env: { get: (k: string) => ({ WALL_APP_SECRET: 's3cret', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' }[k]) },
  })
  await import('./index.ts')
  handler = db.serve.mock.calls[0][0]
})
afterAll(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const routine = (id: string, kid: string, days: string[]) => ({
  id, user_id: 'scott', visibility: 'active', paused_until: null,
  description: `On kaleb-puzzle-trail.vercel.app/?kid=${kid}`, recurrence_pattern: { type: 'weekly', days },
})
const call = (body: unknown, secret = 's3cret') => handler(new Request('https://x.invalid', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-app-secret': secret }, body: JSON.stringify(body),
}))

beforeEach(() => {
  db.routines = [routine('ella-round', 'ella', ['mon', 'tue', 'thu', 'sat']), routine('ella-checkin', 'ella', ['sun']), routine('kaleb-round', 'kaleb', ['mon', 'tue', 'thu', 'sat'])]
  db.instances = []
})

describe('wall-app-done', () => {
  it('refuses a caller without the secret', async () => {
    expect((await call({ app: 'kaleb-puzzle-trail.vercel.app', kid: 'ella', dates: ['2026-10-27'] }, 'wrong')).status).toBe(401)
    expect(db.instances).toEqual([])
  })

  it("checks off that kid's routine due that day, and only that one", async () => {
    const res = await call({ app: 'kaleb-puzzle-trail.vercel.app', kid: 'ella', dates: ['2026-10-27', '2026-10-25'] })
    expect(await res.json()).toEqual({ marked: [{ routineId: 'ella-round', date: '2026-10-27' }, { routineId: 'ella-checkin', date: '2026-10-25' }] })
    expect(db.instances.map((i) => [i.entity_id, i.date, i.status, i.user_id])).toEqual([
      ['ella-round', '2026-10-27', 'completed', 'scott'], ['ella-checkin', '2026-10-25', 'completed', 'scott'],
    ])
  })

  it('completes an existing pending instance instead of adding a second, and is harmless twice', async () => {
    db.instances = [{ id: 'p', entity_type: 'routine', entity_id: 'ella-round', date: '2026-10-29', user_id: 'scott', status: 'pending' }]
    await call({ app: 'kaleb-puzzle-trail.vercel.app', kid: 'ella', dates: ['2026-10-29'] })
    await call({ app: 'kaleb-puzzle-trail.vercel.app', kid: 'ella', dates: ['2026-10-29'] })
    expect(db.instances).toHaveLength(1)
    expect(db.instances[0].status).toBe('completed')
  })

  it('ignores an unknown app', async () => {
    expect((await call({ app: 'evil.example', kid: 'ella', dates: ['2026-10-27'] })).status).toBe(400)
  })
})
