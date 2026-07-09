// Dev-time helper: generate voice samples from ElevenLabs so Scott can
// pick a voice for guided narration. Fetches available voices, generates
// samples of the first 4 (or specified voice IDs), and writes mp3 files.
// Run with:  ELEVENLABS_API_KEY=... npx tsx scripts/narration-samples.ts
// Optional: pass comma-separated voice IDs as first arg (e.g. "21m00Tcm4TlvDq8ikWAM,nPczCjzI2devNBz1zQrb")
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SESSIONS } from '../src/components/planning/guided/sessions'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const samplesDir = resolve(process.env.SAMPLES_DIR || resolve(root, 'narration-samples'))

const apiKey = process.env.ELEVENLABS_API_KEY
if (!apiKey) { console.error('ELEVENLABS_API_KEY is required'); process.exit(1) }

mkdirSync(samplesDir, { recursive: true })

interface Voice { voice_id: string; name: string; labels?: Record<string, string> }

async function tts(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey!, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  // Fetch available voices
  const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey! },
  })
  if (!voicesRes.ok) throw new Error(`ElevenLabs voices ${voicesRes.status}: ${await voicesRes.text()}`)

  interface VoicesResponse { voices: Voice[] }
  const { voices } = (await voicesRes.json()) as VoicesResponse

  // Print first 8 voices
  console.log('Available voices:')
  for (const voice of voices.slice(0, 8)) {
    const labels = Object.values(voice.labels || {}).join(', ')
    console.log(`  ${voice.name.padEnd(24)}${voice.voice_id}  ${labels}`)
  }
  console.log('')

  // Determine which voices to sample
  let voiceIds: string[] = []
  if (process.argv[2]) {
    voiceIds = process.argv[2].split(',').map(v => v.trim())
  } else {
    voiceIds = voices.slice(0, 4).map(v => v.voice_id)
  }

  // Generate samples
  const text = SESSIONS.seasonal.steps[0].narration
  for (const voiceId of voiceIds) {
    const voice = voices.find(v => v.voice_id === voiceId)
    if (!voice) { console.error(`Voice not found: ${voiceId}`); continue }

    process.stdout.write(`generating sample for ${voice.name}… `)
    const audio = await tts(text, voiceId)
    const filename = `sample-${voice.name.toLowerCase().replace(/\s+/g, '-')}.mp3`
    const filepath = resolve(samplesDir, filename)
    writeFileSync(filepath, audio)
    console.log(filepath)
  }
}

main().catch(err => { console.error(err.message); process.exit(1) })
