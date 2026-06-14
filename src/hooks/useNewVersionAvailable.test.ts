import { describe, it, expect } from 'vitest'
import { bundleTagFromHtml } from './useNewVersionAvailable'

describe('bundleTagFromHtml', () => {
  const htmlWith = (js: string) =>
    `<!doctype html><html><head><script type="module" crossorigin src="${js}"></script></head><body></body></html>`

  it('extracts the hashed entry bundle path', () => {
    expect(bundleTagFromHtml(htmlWith('/assets/index-AbC123.js'))).toBe('/assets/index-AbC123.js')
  })

  it('is stable regardless of order and dedupes', () => {
    const a = bundleTagFromHtml('<script src="/assets/b-2.js"></script><script src="/assets/a-1.js"></script>')
    const b = bundleTagFromHtml('<script src="/assets/a-1.js"></script><script src="/assets/b-2.js"></script><script src="/assets/a-1.js"></script>')
    expect(a).toBe(b)
    expect(a).toBe('/assets/a-1.js,/assets/b-2.js')
  })

  it('differs between two builds (the signal that triggers the banner)', () => {
    const oldBuild = bundleTagFromHtml(htmlWith('/assets/index-OLD111.js'))
    const newBuild = bundleTagFromHtml(htmlWith('/assets/index-NEW222.js'))
    expect(oldBuild).not.toBe(newBuild)
  })

  it('returns empty string when there is no hashed bundle (dev/unexpected)', () => {
    expect(bundleTagFromHtml('<script type="module" src="/src/main.tsx"></script>')).toBe('')
  })
})
