import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, act, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { DictationMicButton } from './DictationMicButton'

// Minimal stand-in for the Web Speech API (jsdom has none).
class MockRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((e: unknown) => void) | null = null
  onerror: (() => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
}

let instance: MockRecognition

describe('DictationMicButton', () => {
  beforeEach(() => {
    ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = vi.fn(() => {
      instance = new MockRecognition()
      return instance
    })
  })
  afterEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  })

  it('starts dictation on click and emits each final phrase', async () => {
    const onTranscript = vi.fn()
    const { user } = render(<DictationMicButton onTranscript={onTranscript} />)
    await user.click(screen.getByRole('button', { name: /dictate/i }))
    expect(instance.start).toHaveBeenCalled()

    act(() => {
      instance.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'buy milk' }, isFinal: true, length: 1 }],
      })
    })
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('buy milk'))
  })

  it('renders nothing when speech recognition is unsupported', () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    const { container } = render(<DictationMicButton onTranscript={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
