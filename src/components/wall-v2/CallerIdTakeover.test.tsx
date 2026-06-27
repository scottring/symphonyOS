import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { callHeadline, CallerIdTakeover } from './CallerIdTakeover'
import type { CurrentCall } from '@/hooks/useCurrentCall'

const mockUseCurrentCall = vi.fn<[], CurrentCall | null>()
vi.mock('@/hooks/useCurrentCall', () => ({
  useCurrentCall: () => mockUseCurrentCall(),
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

beforeEach(() => mockUseCurrentCall.mockReset())

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
    mockUseCurrentCall.mockReturnValue(null)
    const { container } = render(<CallerIdTakeover />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the inbound headline', () => {
    mockUseCurrentCall.mockReturnValue(call())
    render(<CallerIdTakeover />)
    expect(screen.getByRole('heading', { name: 'Grandma is calling' })).toBeInTheDocument()
  })

  it('shows the outbound headline', () => {
    mockUseCurrentCall.mockReturnValue(call({ direction: 'outbound' }))
    render(<CallerIdTakeover />)
    expect(screen.getByRole('heading', { name: 'Calling Grandma…' })).toBeInTheDocument()
  })

  it('renders the photo when present', () => {
    mockUseCurrentCall.mockReturnValue(call({ photo_url: 'https://x/g.jpg' }))
    render(<CallerIdTakeover />)
    const img = document.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('https://x/g.jpg')
  })

  it('falls back to the initial placeholder when no photo', () => {
    mockUseCurrentCall.mockReturnValue(call({ photo_url: null, name: 'Grandma' }))
    render(<CallerIdTakeover />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('G')).toBeInTheDocument()
  })
})
