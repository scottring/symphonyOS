import { describe, it, expect, vi, beforeEach } from 'vitest'
// Plain RTL render: the takeover needs no providers, and the shared wrapper's
// storage-backed providers don't load in this test environment.
import { render, screen, fireEvent } from '@testing-library/react'
import { callHeadline, CallerIdTakeover, shouldRing } from './CallerIdTakeover'
import type { CurrentCall, UseCurrentCallResult } from '@/hooks/useCurrentCall'

const mockUseCurrentCall = vi.fn<[], UseCurrentCallResult>()
vi.mock('@/hooks/useCurrentCall', () => ({
  useCurrentCall: () => mockUseCurrentCall(),
}))
const mockDismiss = vi.fn()
const mockStopRinging = vi.fn()
const mockStartRinging = vi.fn((_id: string) => mockStopRinging)
vi.mock('@/lib/wall/ringtones', () => ({
  startRinging: (id: string) => mockStartRinging(id),
  loadRingtone: () => 'frog-chorus',
}))

function call(over: Partial<CurrentCall> = {}): CurrentCall {
  return {
    id: 'singleton',
    call_sid: 'CA1',
    direction: 'inbound',
    state: 'ringing',
    name: 'Grandma',
    number: '+15053793057',
    photo_url: null,
    at: '2026-06-27T10:00:00Z',
    expires_at: '2026-06-27T10:01:30Z',
    ...over,
  }
}

function mockResult(over: Partial<CurrentCall> | null): UseCurrentCallResult {
  return { call: over === null ? null : call(over), dismiss: mockDismiss }
}

beforeEach(() => {
  mockUseCurrentCall.mockReset()
  mockDismiss.mockReset()
  mockStartRinging.mockClear()
  mockStopRinging.mockReset()
})

describe('callHeadline', () => {
  it('inbound reads "{name} is calling"', () => {
    expect(callHeadline({ direction: 'inbound', name: 'Grandma' })).toBe('Grandma is calling')
  })
  it('outbound reads "Calling {name}…"', () => {
    expect(callHeadline({ direction: 'outbound', name: 'Grandma' })).toBe('Calling Grandma…')
  })
  it('an answered inbound call reads "On the phone with {name}"', () => {
    expect(callHeadline({ direction: 'inbound', name: 'Grandma', state: 'connected' })).toBe('On the phone with Grandma')
    expect(callHeadline({ direction: 'inbound', name: null, state: 'connected' })).toBe('On the phone')
  })
  it('falls back gracefully when name is missing', () => {
    expect(callHeadline({ direction: 'inbound', name: null })).toBe('Someone is calling')
    expect(callHeadline({ direction: 'outbound', name: '' })).toBe('Calling someone…')
  })
})

describe('CallerIdTakeover', () => {
  it('renders nothing when there is no live call', () => {
    mockUseCurrentCall.mockReturnValue(mockResult(null))
    const { container } = render(<CallerIdTakeover />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the inbound headline', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({}))
    render(<CallerIdTakeover />)
    expect(screen.getByRole('heading', { name: 'Grandma is calling' })).toBeInTheDocument()
  })

  it('shows the outbound headline', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({ direction: 'outbound' }))
    render(<CallerIdTakeover />)
    expect(screen.getByRole('heading', { name: 'Calling Grandma…' })).toBeInTheDocument()
  })

  it('renders the photo when present', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({ photo_url: 'https://x/g.jpg' }))
    render(<CallerIdTakeover />)
    const img = document.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('https://x/g.jpg')
  })

  it('falls back to the initial placeholder when no photo', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({ photo_url: null, name: 'Grandma' }))
    render(<CallerIdTakeover />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('G')).toBeInTheDocument()
  })

  it('"Close this screen" calls dismiss so a stuck takeover can always be cleared — and never claims to hang up', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({ state: 'connected' }))
    render(<CallerIdTakeover />)
    expect(screen.queryByRole('button', { name: /hang up/i })).toBeNull()
    expect(screen.getByText(/continues on the handset/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close this screen/i }))
    expect(mockDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('wall ringtone', () => {
  it('rings only for an inbound call nobody has picked up', () => {
    expect(shouldRing({ direction: 'inbound', state: 'ringing' })).toBe(true)
    expect(shouldRing({ direction: 'inbound', state: 'connected' })).toBe(false)
    expect(shouldRing({ direction: 'outbound', state: 'ringing' })).toBe(false)
    expect(shouldRing(null)).toBe(false)
  })

  it('rings in the chosen tone, and stops when the handset answers', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({}))
    const { rerender } = render(<CallerIdTakeover />)
    expect(mockStartRinging).toHaveBeenCalledWith('frog-chorus')
    expect(screen.getByText('Pick up the phone to answer.')).toBeInTheDocument()
    mockUseCurrentCall.mockReturnValue(mockResult({ state: 'connected' }))
    rerender(<CallerIdTakeover />)
    expect(mockStopRinging).toHaveBeenCalledTimes(1)
    expect(mockStartRinging).toHaveBeenCalledTimes(1)
  })

  it('stops when the screen is closed', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({}))
    const { rerender } = render(<CallerIdTakeover />)
    mockUseCurrentCall.mockReturnValue(mockResult(null))
    rerender(<CallerIdTakeover />)
    expect(mockStopRinging).toHaveBeenCalledTimes(1)
  })

  it('never rings for a call the wall placed', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({ direction: 'outbound' }))
    render(<CallerIdTakeover />)
    expect(mockStartRinging).not.toHaveBeenCalled()
  })
})
