// Transcription comparison only. This does not grade the speech-to-speech
// assistant or prove that a transaction saved. No network until --live.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

export function readPcmWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected PCM WAV')
  let format, pcm
  for (let pos = 12; pos + 8 <= buffer.length;) {
    const name = buffer.toString('ascii', pos, pos + 4), size = buffer.readUInt32LE(pos + 4), start = pos + 8
    if (start + size > buffer.length) throw new Error('Truncated WAV')
    if (name === 'fmt ') {
      if (size < 16) throw new Error('Invalid WAV format')
      format = [buffer.readUInt16LE(start), buffer.readUInt16LE(start + 2), buffer.readUInt32LE(start + 4), buffer.readUInt16LE(start + 14)]
    }
    if (name === 'data') pcm = buffer.subarray(start, start + size)
    pos = start + size + size % 2
  }
  if (JSON.stringify(format) !== '[1,1,24000,16]' || !pcm?.length || pcm.length % 2) throw new Error('Use mono, 24 kHz, signed 16-bit PCM WAV')
  return pcm
}

const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
const numberWords = n => n < 20 ? ones[n] : ['','','twenty','thirty','forty','fifty'][Math.floor(n/10)] + (n%10 ? ` ${ones[n%10]}` : '')
export const normalizeSpeech = text => text.toLowerCase()
  .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_, h, m) => `${numberWords(Number(h))} ${Number(m) === 0 ? "o clock" : Number(m)<10 ? 'oh '+numberWords(Number(m)) : numberWords(Number(m))}`)
  .replace(/\b([0-5]?\d)\b/g, n => numberWords(Number(n)))
  .replace(/[-–—]/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim().replace(/\s+/g, ' ')
const words = text => normalizeSpeech(text).split(/\s+/).filter(Boolean)
export function gradeTranscript(expected, actual, terms = []) {
  if (Array.isArray(expected)) return expected.map(reference => ({ ...gradeTranscript(reference, actual, terms), matchedReference: reference })).sort((a,b) => a.wordErrorRate-b.wordErrorRate)[0]
  const a = words(expected), b = words(actual)
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  const heard = ` ${b.join(' ')} `
  return { wordErrorRate: a.length ? row[b.length] / a.length : b.length ? 1 : 0, unexpectedSpeech: !a.length && !!b.length,
    missingTerms: terms.filter(term => !(Array.isArray(term) ? term : [term]).some(option => heard.includes(` ${words(option).join(' ')} `))) }
}

export async function transcribe(pcm, model, { apiKey, WebSocket, timeoutMs = 45000, pace = delay, noiseReduction, prompt, language }) {
  return new Promise((resolveResult, reject) => {
    const ws = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', { headers: { Authorization: `Bearer ${apiKey}` } })
    const items = new Map()
    let began = 0, committed = 0, firstDelta = null, streaming = false, settled = false
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timeout); ws.close(); error ? reject(error) : resolveResult(result) }
    const timeout = setTimeout(() => finish(new Error('Transcription timed out')), timeoutMs)
    ws.on('error', () => finish(new Error('Transcription connection failed')))
    ws.on('close', () => { if (!settled) finish(new Error('Transcription connection closed before completion')) })
    ws.on('open', () => ws.send(JSON.stringify({ type: 'session.update', session: { type: 'transcription', audio: { input: {
      format: { type: 'audio/pcm', rate: 24000 }, transcription: { model, ...(prompt ? {prompt} : {}), ...(language ? {language} : {}) }, turn_detection: null, ...(noiseReduction ? { noise_reduction: { type: noiseReduction } } : {}),
    } } } })))
    ws.on('message', async raw => {
      try {
        const event = JSON.parse(String(raw))
        if (event.type === 'error') { finish(new Error(`Provider refused transcription (${event.error?.code ?? 'unknown'}; field=${event.error?.param ?? 'unknown'})`)); return }
        if ((event.type === 'session.updated' || event.type === 'transcription_session.updated') && !streaming) {
          streaming = true; began = performance.now()
          // Send 100 ms chunks paced like live speech, identically for each model.
          for (let offset = 0; offset < pcm.length && !settled; offset += 4800) {
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.subarray(offset, offset + 4800).toString('base64') }))
            await pace(100)
          }
          if (!settled) { committed = performance.now(); ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' })) }
        }
        if (event.type === 'conversation.item.input_audio_transcription.delta' && firstDelta === null) firstDelta = performance.now() - began
        if (event.type === 'conversation.item.input_audio_transcription.failed') finish(new Error('Audio transcription failed'))
        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          items.set(event.item_id, event.transcript)
          finish(null, { transcript: [...items.values()].join(' '), firstDeltaMs: firstDelta, afterCommitMs: committed ? performance.now() - committed : null })
        }
      } catch { finish(new Error('Invalid transcription event or send failure')) }
    })
  })
}

async function main() {
  const manifestPath = resolve(process.argv[2] ?? 'scripts/conversation-bench/audio-cases.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const live = process.argv.includes('--live')
  const clips = manifest.clips.map(clip => {
    try { return { ...clip, pcm: readPcmWav(readFileSync(resolve(dirname(manifestPath), clip.file))) } }
    catch (error) { return { ...clip, error: error.message } }
  })
  if (!live) {
    console.log(JSON.stringify({ mode: 'preflight; no provider calls', models: manifest.models, clips: clips.map(({ id, pcm, error }) => ({ id, seconds: pcm ? pcm.length / 48000 : undefined, status: error ? 'missing-or-invalid-audio' : 'ready', error })) }, null, 2))
    process.exitCode = clips.some(c => c.error) ? 2 : 0; return
  }
  if (clips.some(c => c.error)) throw new Error('All audio fixtures must pass preflight before any paid call')
  const seconds = clips.reduce((total, clip) => total + clip.pcm.length / 48000, 0) * manifest.models.length
  if (!Number.isFinite(manifest.maxAudioSeconds) || seconds > manifest.maxAudioSeconds) throw new Error('Comparison exceeds manifest audio-duration cap')
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for --live')
  const { default: WebSocket } = await import('ws')
  const report = { at: new Date().toISOString(), kind: 'transcription-only', models: manifest.models, results: [] }
  for (const clip of clips) for (const model of manifest.models) {
    try {
      const got = await transcribe(clip.pcm, model, { apiKey: process.env.OPENAI_API_KEY, WebSocket, timeoutMs: clip.pcm.length / 48 + 30000, noiseReduction: clip.noiseReduction, prompt: clip.prompt, language: clip.language })
      const grade = gradeTranscript([clip.reference, ...(clip.acceptableTranscripts ?? [])], got.transcript, clip.requiredTerms)
      console.log(`Completed ${clip.id}: ${model}`)
      report.results.push({ clip: clip.id, model, provenance: clip.provenance, noiseReduction: clip.noiseReduction ?? null, prompt: clip.prompt ?? null, language: clip.language ?? null, ...got, ...grade,
        status: grade.unexpectedSpeech || grade.missingTerms.length || grade.wordErrorRate > (clip.maxWordErrorRate ?? .15) ? 'failed' : 'passed' })
    } catch (error) { report.results.push({ clip: clip.id, model, status: 'failed', error: error.message }) }
  }
  mkdirSync(resolve(dirname(manifestPath), 'reports'), { recursive: true })
  const output = resolve(dirname(manifestPath), 'reports', `audio-${Date.now()}.json`)
  writeFileSync(output, JSON.stringify(report, null, 2))
  console.log(output)
  process.exitCode = report.results.every(r => r.status === 'passed') ? 0 : 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
