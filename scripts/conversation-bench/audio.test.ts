import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { gradeTranscript, readPcmWav, transcribe } from './audio.mjs'

describe('audio comparison', () => {
  it('ignores punctuation but catches the wrong person, date and amount', () => {
    expect(gradeTranscript('Call Kaleb Friday.', 'Call Kaleb, Friday!', ['Kaleb', 'Friday']).wordErrorRate).toBe(0)
    expect(gradeTranscript('Call Kaleb Friday', 'Call Caleb Thursday', ['Kaleb', 'Friday']).missingTerms).toEqual(['Kaleb', 'Friday'])
  })
  it('silence must not invent words, including the vocabulary hint', () => {
    expect(gradeTranscript('', '').unexpectedSpeech).toBe(false)
    expect(gradeTranscript('', 'Kaleb, piano, school').unexpectedSpeech).toBe(true)
  })
  it('refuses unsupported audio before a model call', () => {
    expect(() => readPcmWav(Buffer.from('not a wave'))).toThrow()
    const wav = Buffer.alloc(48)
    wav.write('RIFF'); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt16LE(16, 34)
    wav.write('data', 36); wav.writeUInt32LE(4, 40)
    expect(readPcmWav(wav).length).toBe(4)
    wav.writeUInt32LE(44100, 24); expect(() => readPcmWav(wav)).toThrow(/24 kHz/)
  })
  it('requires acknowledgement before streaming, commits once, and fails a closed session', async () => {
    class Socket extends EventEmitter {
      static last: Socket
      sent: any[] = []
      constructor() { super(); Socket.last = this }
      send(raw: string) { this.sent.push(JSON.parse(raw)) }
      close() { this.emit('close') }
    }
    vi.useFakeTimers()
    try {
      const result = transcribe(Buffer.alloc(4800), 'gpt-realtime-whisper', { apiKey: 'test', WebSocket: Socket, pace: async () => {} })
      const ws = Socket.last
      ws.emit('open')
      expect(ws.sent.map(e => e.type)).toEqual(['session.update'])
      ws.emit('message', JSON.stringify({ type: 'session.updated' }))
      await vi.advanceTimersByTimeAsync(100)
      expect(ws.sent.map(e => e.type)).toEqual(['session.update', 'input_audio_buffer.append', 'input_audio_buffer.commit'])
      ws.emit('message', JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Approve' }))
      expect((await result).transcript).toBe('Approve')
      const failed = transcribe(Buffer.alloc(4800), 'gpt-4o-mini-transcribe', { apiKey: 'test', WebSocket: Socket })
      const assertion = expect(failed).rejects.toThrow('closed before completion')
      Socket.last.emit('close'); await assertion
    } finally { vi.useRealTimers() }
  })
})

it('accepts equivalent spoken times but rejects thirteen versus thirty and retains negation', () => {
  const expected = 'The appointment is at four thirty, not four thirteen.'
  expect(gradeTranscript(expected, 'The appointment is at 4:30, not 4:13.', ['thirty','thirteen','not'])).toMatchObject({ wordErrorRate: 0, missingTerms: [] })
  expect(gradeTranscript('At four thirty', 'At 4:13', ['thirty']).missingTerms).toEqual(['thirty'])
  expect(gradeTranscript('Do not approve', 'Approve', ['not']).missingTerms).toEqual(['not'])
})

it('allows only the approval equivalents explicitly accepted by the app command parser', () => {
  expect(gradeTranscript(['Approve.', 'Approved.'], 'Approved.', [['Approve','Approved']])).toMatchObject({wordErrorRate:0,missingTerms:[]})
  expect(gradeTranscript(['Approve.', 'Approved.'], 'Disapproved.', [['Approve','Approved']]).missingTerms).toHaveLength(1)
  expect(gradeTranscript(['Approve.', 'Approved.'], 'Do not approve.', [['Approve','Approved']]).wordErrorRate).toBeGreaterThan(0.15)
})
