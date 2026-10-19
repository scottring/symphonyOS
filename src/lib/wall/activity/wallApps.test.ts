import { describe, it, expect } from 'vitest'
import { wallAppFor, isAppDone } from './wallApps'

describe('wall apps', () => {
  it('finds an allowed app link in a routine description, with or without https', () => {
    expect(wallAppFor('About 10 minutes on kaleb-puzzle-trail.vercel.app. The app picks.')).toEqual({
      url: 'https://kaleb-puzzle-trail.vercel.app/', title: 'Puzzle Trail', origin: 'https://kaleb-puzzle-trail.vercel.app',
    })
    expect(wallAppFor('Open https://kaleb-puzzle-trail.vercel.app/#grown')?.url).toBe('https://kaleb-puzzle-trail.vercel.app/#grown')
  })

  it('ignores hosts that are not allowed, and empty descriptions', () => {
    expect(wallAppFor('see example.com or evil.vercel.app')).toBeNull()
    expect(wallAppFor('kaleb-puzzle-trail.vercel.app.evil.com')).toBeNull()
    expect(wallAppFor(null)).toBeNull()
  })

  it('accepts done only from the app’s own origin', () => {
    const app = { origin: 'https://kaleb-puzzle-trail.vercel.app' }
    expect(isAppDone(app, 'https://kaleb-puzzle-trail.vercel.app', { type: 'symphony:done' })).toBe(true)
    expect(isAppDone(app, 'https://evil.example', { type: 'symphony:done' })).toBe(false)
    expect(isAppDone(app, 'https://kaleb-puzzle-trail.vercel.app', 'symphony:done')).toBe(false)
  })
})
