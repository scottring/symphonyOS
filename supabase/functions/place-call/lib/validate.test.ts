import { describe, it, expect } from 'vitest'
import { validateBody, buildLogRow } from './validate'

describe('validateBody', () => {
  it('accepts a bridge call with a task', () => {
    expect(validateBody({ taskId: 't1' })).toEqual({ ok: true, mode: 'bridge' })
  })

  it('accepts a bridge call with a raw number', () => {
    expect(validateBody({ toNumber: '555-0100' })).toEqual({ ok: true, mode: 'bridge' })
  })

  it('gates agent mode off (403) until Phase 5', () => {
    expect(validateBody({ toNumber: '555-0100', mode: 'agent' })).toEqual({
      ok: false, status: 403, error: 'agent mode not enabled (Phase 5)',
    })
  })

  it('rejects an unknown mode', () => {
    // @ts-expect-error testing invalid input
    expect(validateBody({ toNumber: '1', mode: 'robocall' }).ok).toBe(false)
  })

  it('requires a task, a number, or a contactId', () => {
    expect(validateBody({})).toEqual({ ok: false, status: 400, error: 'taskId, toNumber or contactId required' })
  })

  it('accepts a contactId alone', () => {
    expect(validateBody({ contactId: 'grandma' })).toMatchObject({ ok: true, mode: 'bridge' })
  })
})

describe('buildLogRow', () => {
  it('builds a requested outbound row', () => {
    expect(buildLogRow('u1', '555-0100', 'bridge', 't1', null)).toEqual({
      user_id: 'u1',
      task_id: 't1',
      to_number: '555-0100',
      mode: 'bridge',
      direction: 'outbound',
      status: 'requested',
      call_sid: null,
    })
  })

  it('nulls task_id when absent and carries a call_sid', () => {
    const row = buildLogRow('u1', '555-0100', 'bridge', undefined, 'CA123')
    expect(row.task_id).toBeNull()
    expect(row.call_sid).toBe('CA123')
  })
})
