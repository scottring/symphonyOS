import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFileDropGuard } from './useFileDropGuard'

function dragEvent(type: string, types: string[], target: EventTarget = window) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'dataTransfer', { value: { types, files: [], dropEffect: '' } })
  target.dispatchEvent(e)
  return e as Event & { dataTransfer: { dropEffect: string } }
}

describe('useFileDropGuard', () => {
  it('blocks the browser default for a stray file drop', () => {
    renderHook(() => useFileDropGuard())
    expect(dragEvent('dragover', ['Files']).defaultPrevented).toBe(true)
    expect(dragEvent('drop', ['Files']).defaultPrevented).toBe(true)
  })

  it('shows "not allowed" outside a real drop zone', () => {
    renderHook(() => useFileDropGuard())
    expect(dragEvent('dragover', ['Files']).dataTransfer.dropEffect).toBe('none')
  })

  it('leaves internal item drags completely alone', () => {
    renderHook(() => useFileDropGuard())
    // dnd-kit / planning grids / routines canvas
    expect(dragEvent('dragover', ['text/plain']).defaultPrevented).toBe(false)
    expect(dragEvent('drop', ['application/x-symphony-item']).defaultPrevented).toBe(false)
  })

  it('does not override a real drop zone that already claimed the event', () => {
    renderHook(() => useFileDropGuard())
    const zone = document.createElement('div')
    document.body.appendChild(zone)
    // A real zone prevents default and asks for 'copy' before it reaches window.
    zone.addEventListener('dragover', (e) => {
      e.preventDefault()
      ;(e as DragEvent).dataTransfer!.dropEffect = 'copy'
    })
    const e = dragEvent('dragover', ['Files'], zone)
    expect(e.dataTransfer.dropEffect).toBe('copy')
    document.body.removeChild(zone)
  })

  it('detaches its listeners on unmount', () => {
    const { unmount } = renderHook(() => useFileDropGuard())
    unmount()
    expect(dragEvent('dragover', ['Files']).defaultPrevented).toBe(false)
  })
})
