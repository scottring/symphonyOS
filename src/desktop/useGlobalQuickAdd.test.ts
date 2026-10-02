import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const listeners = new Map<string, (p: unknown) => void>()
const emitted: string[] = []
vi.mock('@/lib/desktop', () => ({
  desktopEmit: (e: string) => { emitted.push(e) },
  onDesktopEvent: (e: string, h: (p: unknown) => void) => { listeners.set(e, h); return () => listeners.delete(e) },
}))

import { useGlobalQuickAdd, HAND_BACK_DELAY_MS } from './useGlobalQuickAdd'

function setup() {
  let open = false
  const setOpen = vi.fn((v: boolean) => { open = v; hook.rerender() })
  const hook = renderHook(() => useGlobalQuickAdd(open, setOpen))
  const fire = (handBack: boolean) => act(() => { listeners.get('shell:quick-add-global')!(handBack) })
  return { hook, setOpen, fire, isOpen: () => open }
}

describe('useGlobalQuickAdd — ⌃⌥Space from another app', () => {
  beforeEach(() => { emitted.length = 0; listeners.clear(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('opens ⌘K, and Esc hands focus straight back', () => {
    const { hook, fire, isOpen } = setup()
    fire(true)
    expect(isOpen()).toBe(true)
    act(() => hook.result.current.closeQuickAdd())
    expect(isOpen()).toBe(false)
    expect(emitted).toEqual(['shell:hide-app'])
  })

  it('after an add, waits for the write and the confirmation before handing back', async () => {
    const { hook, fire } = setup()
    fire(true)
    let finish!: () => void
    const add = hook.result.current.tracked(() => new Promise<void>((r) => { finish = r }))
    act(() => { void add() })
    act(() => hook.result.current.closeQuickAdd())
    expect(emitted).toEqual([])
    await act(async () => { finish(); await Promise.resolve() })
    act(() => { vi.advanceTimersByTime(HAND_BACK_DELAY_MS - 1) })
    expect(emitted).toEqual([])
    act(() => { vi.advanceTimersByTime(1) })
    expect(emitted).toEqual(['shell:hide-app'])
  })

  it('going somewhere from it keeps Symphony up', () => {
    const { hook, fire } = setup()
    fire(true)
    act(() => { hook.result.current.stayInSymphony(); hook.result.current.closeQuickAdd() })
    expect(emitted).toEqual([])
  })

  it('when Symphony was already in front, nothing is handed back', () => {
    const { hook, fire } = setup()
    fire(false)
    act(() => hook.result.current.closeQuickAdd())
    expect(emitted).toEqual([])
  })

  it('an ordinary ⌘K later does not hand back', () => {
    const { hook, setOpen, fire } = setup()
    fire(true)
    act(() => setOpen(false)) // closed by navigation, not closeQuickAdd
    act(() => setOpen(true))
    act(() => hook.result.current.closeQuickAdd())
    expect(emitted).toEqual([])
  })
})
