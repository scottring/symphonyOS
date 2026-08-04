import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateRequest, buildRow, buildHandsetRow, isHandsetState } from './index.ts'

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

Deno.test('isHandsetState recognizes the off-hook states', () => {
  assertEquals(isHandsetState('offhook'), true)
  assertEquals(isHandsetState('offhook_ended'), true)
})

Deno.test('isHandsetState rejects call states', () => {
  assertEquals(isHandsetState('ringing'), false)
  assertEquals(isHandsetState('ended'), false)
  assertEquals(isHandsetState(undefined), false)
})

Deno.test('validateRequest accepts the off-hook states', () => {
  const h = new Headers({ 'x-kidphone-secret': 'expected' })
  assertEquals(validateRequest(h, { state: 'offhook' }, 'expected').ok, true)
  assertEquals(validateRequest(h, { state: 'offhook_ended' }, 'expected').ok, true)
})

Deno.test('buildHandsetRow marks the handset up with a TTL past the 60s hold', () => {
  const now = new Date('2026-08-04T12:00:00Z')
  const row = buildHandsetRow({ state: 'offhook' }, now)
  assertEquals(row.off_hook, true)
  assertEquals(new Date(row.expires_at as string).getTime() - now.getTime() > 60_000, true)
})

Deno.test('buildHandsetRow marks the handset down and expires immediately', () => {
  const now = new Date('2026-08-04T12:00:00Z')
  const row = buildHandsetRow({ state: 'offhook_ended' }, now)
  assertEquals(row.off_hook, false)
  assertEquals(row.expires_at, now.toISOString())
})
