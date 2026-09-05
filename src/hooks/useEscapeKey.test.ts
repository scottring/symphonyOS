import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEscapeKey } from './useEscapeKey'

afterEach(() => { document.body.innerHTML = '' })

function pressEscape(target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  target.dispatchEvent(e)
  return e
}

describe('useEscapeKey', () => {
  it('fires on Escape while active', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(true, onEscape))
    pressEscape()
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('marks the event handled so an outer surface does not also close', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(true, onEscape))
    const e = pressEscape()
    expect(e.defaultPrevented).toBe(true)
  })

  it('ignores other keys', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(true, onEscape))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('does nothing while inactive, and stops listening after unmount', () => {
    const onEscape = vi.fn()
    const { unmount, rerender } = renderHook(({ active }) => useEscapeKey(active, onEscape), {
      initialProps: { active: false },
    })
    pressEscape()
    expect(onEscape).not.toHaveBeenCalled()

    rerender({ active: true })
    pressEscape()
    expect(onEscape).toHaveBeenCalledTimes(1)

    unmount()
    pressEscape()
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('closes the innermost open surface only — one Escape, one layer', () => {
    const closePanel = vi.fn()
    const closeDrawer = vi.fn()
    // Panel mounts first, drawer opens from inside it later.
    renderHook(() => useEscapeKey(true, closePanel))
    const drawer = renderHook(() => useEscapeKey(true, closeDrawer))

    pressEscape()
    expect(closeDrawer).toHaveBeenCalledTimes(1)
    expect(closePanel).not.toHaveBeenCalled()

    drawer.unmount()
    pressEscape()
    expect(closePanel).toHaveBeenCalledTimes(1)
    expect(closeDrawer).toHaveBeenCalledTimes(1)
  })

  it('yields to an inner overlay that already handled the Escape', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(true, onEscape))
    // e.g. a popover's useClickOutside, or PanelNotes leaving wide mode —
    // registered on document, so it runs before this window listener.
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.preventDefault() }, { once: true })
    pressEscape()
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('leaves a focused field instead of closing; the next Escape closes', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(true, onEscape))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    pressEscape(input)
    expect(onEscape).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(input)

    pressEscape()
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('treats a contenteditable editor as a field', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(true, onEscape))
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    editor.tabIndex = 0
    document.body.appendChild(editor)
    editor.focus()

    pressEscape(editor)
    expect(onEscape).not.toHaveBeenCalled()
  })
})
