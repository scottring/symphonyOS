import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { callHeadline, CallerIdTakeover } from './CallerIdTakeover'
import type { CurrentCall, UseCurrentCallResult } from '@/hooks/useCurrentCall'

const mockUseCurrentCall = vi.fn<[], UseCurrentCallResult>()
vi.mock('@/hooks/useCurrentCall', () => ({
  useCurrentCall: () => mockUseCurrentCall(),
}))
const mockDismiss = vi.fn()

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
})

describe('callHeadline', () => {
  it('inbound reads "{name} is calling"', () => {
    expect(callHeadline({ direction: 'inbound', name: 'Grandma' })).toBe('Grandma is calling')
  })
  it('outbound reads "Calling {name}…"', () => {
    expect(callHeadline({ direction: 'outbound', name: 'Grandma' })).toBe('Calling Grandma…')
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

  it('hang up calls dismiss so a stuck takeover can always be cleared', () => {
    mockUseCurrentCall.mockReturnValue(mockResult({}))
    render(<CallerIdTakeover />)
    fireEvent.click(screen.getByRole('button', { name: /hang up/i }))
    expect(mockDismiss).toHaveBeenCalledTimes(1)
  })
})
