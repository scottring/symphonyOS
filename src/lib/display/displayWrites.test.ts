import { describe, expect, it, vi } from 'vitest'
import { displaySetRoutineDone, displaySetTaskDone, isDisplayUser } from './displayWrites'

const client = (error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ data: null, error }) }) as never

describe('a display’s check-offs', () => {
  it('only an anonymous sign-in is a display', () => {
    expect(isDisplayUser({ is_anonymous: true })).toBe(true)
    expect(isDisplayUser({ is_anonymous: false })).toBe(false)
    expect(isDisplayUser(null)).toBe(false)
  })
  it('checks a routine off for a local day through the server', async () => {
    const c = client()
    expect(await displaySetRoutineDone('r1', new Date(2026, 9, 21, 23, 30), true, null, c)).toBe(true)
    expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('display_set_routine_done', { p_routine_id: 'r1', p_date: '2026-10-21', p_done: true })
  })
  it('sends progress when there is some', async () => {
    const c = client()
    await displaySetRoutineDone('r1', new Date(2026, 9, 21), false, 12.4, c)
    expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('display_set_routine_done', { p_routine_id: 'r1', p_date: '2026-10-21', p_done: false, p_progress: 12 })
  })
  it('reports a refusal (another kid’s item) as not saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await displaySetTaskDone('t1', true, client({ message: 'This tablet can only check off its own things' }))).toBe(false)
  })
})
