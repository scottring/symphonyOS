// Drift guard: every narration string in the configs must have a generated
// clip whose stored text EXACTLY matches. Until the first generation run
// (needs the ElevenLabs key + a chosen voice) the manifest ships with
// bootstrap: true and this suite warns loudly instead of failing.
import { describe, it, expect } from 'vitest'
import { SESSIONS } from './sessions'
import manifest from './narration.manifest.json'
import { narrationClip } from './narration'

describe('narration manifest', () => {
  const entries = Object.entries(SESSIONS).flatMap(([h, cfg]) =>
    cfg.steps.map((s) => ({ key: `${h}.${s.id}`, text: s.narration })))

  if (manifest.bootstrap) {
    it('BOOTSTRAP MODE — narration not yet generated', () => {
      console.warn(
        `[narration] manifest is in bootstrap mode: ${entries.length} clips ungenerated. ` +
        'Run `npm run narration` with ELEVENLABS_API_KEY set.')
      expect(manifest.clips).toEqual({})
    })
  } else {
    it.each(entries)('$key has a generated clip with matching text', ({ key, text }) => {
      const clip = (manifest.clips as Record<string, { text: string; file: string }>)[key]
      expect(clip, `${key} missing — run npm run narration`).toBeDefined()
      expect(clip.text, `${key} text drifted — run npm run narration`).toBe(text)
      expect(clip.file).toMatch(/^[a-z0-9-]+\.[0-9a-f]{8}\.mp3$/)
    })
  }

  it('narrationClip returns null for unknown/missing clips', () => {
    expect(narrationClip('daily', 'nope', 'text')).toBeNull()
  })
})
