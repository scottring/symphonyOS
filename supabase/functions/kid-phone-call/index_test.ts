import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateRequest, buildRow } from './index.ts'

type FailResult = { ok: false; status: number; error: string }

Deno.test('validateRequest rejects missing secret', () => {
  const r = validateRequest(new Headers({}), { state: 'ringing' }, 'expected')
  assertEquals(r.ok, false)
  assertEquals((r as FailResult).status, 401)
})

Deno.test('validateRequest rejects wrong secret', () => {
  const r = validateRequest(new Headers({ 'x-kidphone-secret': 'nope' }), { state: 'ringing' }, 'expected')
  assertEquals(r.ok, false)
  assertEquals((r as FailResult).status, 401)
})

Deno.test('validateRequest rejects a bad state', () => {
  const r = validateRequest(new Headers({ 'x-kidphone-secret': 'expected' }), { state: 'weird' as never }, 'expected')
  assertEquals(r.ok, false)
  assertEquals((r as FailResult).status, 400)
})

Deno.test('validateRequest accepts a well-formed event', () => {
  const r = validateRequest(
    new Headers({ 'x-kidphone-secret': 'expected' }),
    { state: 'ringing', direction: 'inbound', name: 'Grandma' },
    'expected',
  )
  assertEquals(r.ok, true)
})

Deno.test('buildRow gives an active row a future TTL', () => {
  const now = new Date('2026-06-27T10:00:00.000Z')
  const row = buildRow({ state: 'ringing', direction: 'inbound', name: 'Grandma', photoURL: 'u' }, now)
  assertEquals(row.id, 'singleton')
  assertEquals(row.state, 'ringing')
  assertEquals(row.photo_url, 'u')
  assertEquals(row.expires_at, '2026-06-27T10:01:30.000Z') // now + 90s
})

Deno.test('buildRow expires an ended row immediately', () => {
  const now = new Date('2026-06-27T10:00:00.000Z')
  const row = buildRow({ state: 'ended', direction: 'outbound' }, now)
  assertEquals(row.state, 'ended')
  assertEquals(row.expires_at, '2026-06-27T10:00:00.000Z') // == now
})
