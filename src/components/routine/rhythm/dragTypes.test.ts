import { describe, it, expect } from 'vitest'
import { setDragPayload, readDragPayload, acceptsDrag, timeFromAxisX, type DragPayload } from './dragTypes'

function mkDT() {
  const data: Record<string, string> = {}
  return {
    data,
    setData(k: string, v: string) { data[k] = v },
    getData(k: string) { return data[k] ?? '' },
    get types() { return Object.keys(data) },
    effectAllowed: 'none',
    dropEffect: 'none',
  }
}
const ev = (dt: ReturnType<typeof mkDT>) => ({ dataTransfer: dt }) as unknown as React.DragEvent

describe('drag payload round-trip', () => {
  it('carries a step payload with a kind gate key', () => {
    const dt = mkDT()
    const payload: DragPayload = { kind: 'step', id: 's1' }
    setDragPayload(ev(dt), payload)
    expect(readDragPayload(ev(dt))).toEqual(payload)
    expect(dt.types).toContain('text/rhythm-kind-step')
  })

  it('carries fromDay on routine payloads', () => {
    const dt = mkDT()
    setDragPayload(ev(dt), { kind: 'routine', id: 'r1', fromDay: 'thu' })
    expect(readDragPayload(ev(dt))).toEqual({ kind: 'routine', id: 'r1', fromDay: 'thu' })
  })

  it('returns null for foreign drags', () => {
    const dt = mkDT()
    dt.setData('text/plain', 'hello')
    expect(readDragPayload(ev(dt))).toBeNull()
  })
})

describe('acceptsDrag', () => {
  it('matches on gate keys without reading data', () => {
    const dt = mkDT()
    setDragPayload(ev(dt), { kind: 'group', ids: ['a', 'b'] })
    expect(acceptsDrag(ev(dt), ['group', 'step'])).toBe(true)
    expect(acceptsDrag(ev(dt), ['collection'])).toBe(false)
  })
})

describe('timeFromAxisX', () => {
  const rect = { left: 0, width: 1000 }
  it('maps the edges to the arc bounds', () => {
    expect(timeFromAxisX(0, rect)).toBe('06:00')
    expect(timeFromAxisX(1000, rect)).toBe('21:30')
  })
  it('maps the middle and rounds to 5 minutes', () => {
    expect(timeFromAxisX(500, rect)).toBe('13:45')      // 360 + 465 = 825
    expect(timeFromAxisX(501, rect)).toBe('13:45')      // rounds to nearest 5
  })
  it('clamps outside the axis', () => {
    expect(timeFromAxisX(-80, rect)).toBe('06:00')
    expect(timeFromAxisX(2000, rect)).toBe('21:30')
  })
  it('guards a zero-width rect (jsdom)', () => {
    expect(timeFromAxisX(300, { left: 0, width: 0 })).toBe('06:00')
  })
})
