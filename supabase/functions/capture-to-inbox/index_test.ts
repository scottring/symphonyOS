import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateRequest } from './index.ts'

// Helper: narrow a ValidationResult to the failure branch for status assertions
type FailResult = { ok: false; status: number; error: string }

Deno.test('validateRequest rejects missing secret header', () => {
  const result = validateRequest(
    new Headers({ 'content-type': 'application/json' }),
    { user_email: 'a@b.com', title: 'x' },
    'expected-secret',
  )
  assertEquals(result.ok, false)
  assertEquals((result as FailResult).status, 401)
})

Deno.test('validateRequest rejects wrong secret', () => {
  const result = validateRequest(
    new Headers({ 'x-capture-secret': 'wrong' }),
    { user_email: 'a@b.com', title: 'x' },
    'expected-secret',
  )
  assertEquals(result.ok, false)
  assertEquals((result as FailResult).status, 401)
})

Deno.test('validateRequest rejects missing user_email', () => {
  const result = validateRequest(
    new Headers({ 'x-capture-secret': 'expected-secret' }),
    { title: 'x' } as unknown as { user_email: string; title: string },
    'expected-secret',
  )
  assertEquals(result.ok, false)
  assertEquals((result as FailResult).status, 400)
})

Deno.test('validateRequest rejects missing title', () => {
  const result = validateRequest(
    new Headers({ 'x-capture-secret': 'expected-secret' }),
    { user_email: 'a@b.com' } as unknown as { user_email: string; title: string },
    'expected-secret',
  )
  assertEquals(result.ok, false)
  assertEquals((result as FailResult).status, 400)
})

Deno.test('validateRequest rejects empty title', () => {
  const result = validateRequest(
    new Headers({ 'x-capture-secret': 'expected-secret' }),
    { user_email: 'a@b.com', title: '   ' },
    'expected-secret',
  )
  assertEquals(result.ok, false)
  assertEquals((result as FailResult).status, 400)
})

Deno.test('validateRequest accepts valid request', () => {
  const result = validateRequest(
    new Headers({ 'x-capture-secret': 'expected-secret' }),
    { user_email: 'a@b.com', title: 'buy milk' },
    'expected-secret',
  )
  assertEquals(result.ok, true)
})
