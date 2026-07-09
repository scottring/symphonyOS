// Client-side lookup: step -> narration mp3 URL. Returns null when the clip
// is ungenerated or its text has drifted from the config (we then show text
// silently rather than speak stale audio).
import manifest from './narration.manifest.json'

interface Clip { text: string; file: string }

export function narrationClip(horizon: string, stepId: string, narration: string): string | null {
  const clip = (manifest.clips as Record<string, Clip>)[`${horizon}.${stepId}`]
  if (!clip || clip.text !== narration) return null
  return `/narration/${clip.file}`
}
