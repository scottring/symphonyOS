import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useClickOutside } from './useClickOutside'

function mountRef() {
  const inside = document.createElement('div')
  const child = document.createElement('button')
  inside.appendChild(child)
  const outside = document.createElement('div')
  document.body.append(inside, outside)
  return { inside, child, outside }
}

afterEach(() => { document.body.innerHTML = '' })

describe('useClickOutside', () => {
  it('fires on a mousedown outside the ref', () => {
    const { inside, outside } = mountRef()
    const onDismiss = vi.fn()
    renderHook(() => useClickOutside({ current: inside }, onDismiss, true))

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire when the mousedown is inside the ref (incl. the trigger)', () => {
    const { inside, child } = mountRef()
    const onDismiss = vi.fn()
    renderHook(() => useClickOutside({ current: inside }, onDismiss, true))

    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('fires on Escape', () => {
    const { inside } = mountRef()
    const onDismiss = vi.fn()
    renderHook(() => useClickOutside({ current: inside }, onDismiss, true))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does nothing while inactive', () => {
    const { outside } = mountRef()
    const onDismiss = vi.fn()
    renderHook(() => useClickOutside({ current: document.createElement('div') }, onDismiss, false))

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
