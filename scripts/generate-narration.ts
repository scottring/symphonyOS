// Dev-time only: generates narration mp3s via ElevenLabs for every step in
// the guided session configs. Hash-keyed: only new/changed narration is
// regenerated. Run with:  ELEVENLABS_API_KEY=... npm run narration
// Optional: ELEVENLABS_VOICE_ID=... (defaults to the manifest's pinned voice).
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SESSIONS } from '../src/components/planning/guided/sessions'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'src/components/planning/guided/narration.manifest.json')
const outDir = resolve(root, 'public/narration')

const apiKey = process.env.ELEVENLABS_API_KEY
if (!apiKey) { console.error('ELEVENLABS_API_KEY is required'); process.exit(1) }

// The sound recipe. Model is overridable for A/B runs (e.g. eleven_v3);
// 128kbps/44.1kHz replaces the original 32kbps voicemail-grade output, and
// the looser stability + speaker boost trade sameness for human variation.
const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'
const OUTPUT_FORMAT = 'mp3_44100_128'
const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true }

interface Manifest { bootstrap: boolean; voiceId: string; clips: Record<string, { text: string; file: string }> }
const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const voiceId = process.env.ELEVENLABS_VOICE_ID || manifest.voiceId
if (!voiceId) { console.error('No voice pinned. Pass ELEVENLABS_VOICE_ID once; it will be saved.'); process.exit(1) }

mkdirSync(outDir, { recursive: true })

async function tts(text: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey!, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: VOICE_SETTINGS,
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

const next: Manifest = { bootstrap: false, voiceId, clips: {} }
let generated = 0, kept = 0

for (const [horizon, cfg] of Object.entries(SESSIONS)) {
  for (const step of cfg.steps) {
    const key = `${horizon}.${step.id}`
    // The hash is the full sound recipe, not just voice+text — changing the
    // model, settings, or output format must regenerate stale clips, not
    // silently keep them (the original bug behind the 32kbps clips surviving).
    const recipe = `${voiceId}\n${modelId}\n${OUTPUT_FORMAT}\n${JSON.stringify(VOICE_SETTINGS)}\n${step.narration}`
    const hash = createHash('sha256').update(recipe).digest('hex').slice(0, 8)
    const file = `${horizon}-${step.id}.${hash}.mp3`
    const existing = manifest.clips[key]
    if (existing && existing.text === step.narration && existsSync(resolve(outDir, existing.file)) && existing.file === file) {
      next.clips[key] = existing; kept++; continue
    }
    process.stdout.write(`generating ${key}… `)
    const audio = await tts(step.narration)
    writeFileSync(resolve(outDir, file), audio)
    next.clips[key] = { text: step.narration, file }
    generated++
    console.log(`${(audio.length / 1024).toFixed(0)}kB`)
  }
}

writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n')
console.log(`done: ${generated} generated, ${kept} unchanged. Manifest bootstrap=false.`)
