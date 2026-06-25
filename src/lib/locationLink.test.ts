import { describe, it, expect } from 'vitest'
import { locationLink } from './locationLink'

describe('locationLink', () => {
  describe('URL-shaped locations (pass through as-is)', () => {
    it('detects https Zoom links', () => {
      const result = locationLink('https://zoom.us/j/12345678901')
      expect(result.kind).toBe('url')
      expect(result.href).toBe('https://zoom.us/j/12345678901')
    })

    it('detects http URLs', () => {
      const result = locationLink('http://example.com/meeting')
      expect(result.kind).toBe('url')
      expect(result.href).toBe('http://example.com/meeting')
    })

    it('detects Google Meet links', () => {
      const result = locationLink('https://meet.google.com/abc-defg-hij')
      expect(result.kind).toBe('url')
    })

    it('detects Microsoft Teams links', () => {
      const result = locationLink('https://teams.microsoft.com/l/meetup-join/foo')
      expect(result.kind).toBe('url')
    })

    it('trims surrounding whitespace before detecting URLs', () => {
      const result = locationLink('  https://zoom.us/j/123  ')
      expect(result.kind).toBe('url')
      expect(result.href).toBe('https://zoom.us/j/123')
    })

    it('ignores placeId when location is a URL (URL wins)', () => {
      const result = locationLink('https://zoom.us/j/123', 'some-place-id')
      expect(result.kind).toBe('url')
      expect(result.href).toBe('https://zoom.us/j/123')
    })
  })

  describe('physical-address locations (wrap in Google Maps dir URL)', () => {
    it('encodes plain street addresses', () => {
      const result = locationLink('123 Main St, Springfield')
      expect(result.kind).toBe('maps')
      expect(result.href).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=123%20Main%20St%2C%20Springfield',
      )
    })

    it('uses placeId when provided', () => {
      const result = locationLink('123 Main St', 'ChIJ_abc123')
      expect(result.kind).toBe('maps')
      expect(result.href).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=place_id:ChIJ_abc123',
      )
    })

    it('treats partial strings (no scheme) as addresses', () => {
      const result = locationLink('Symphony Hall, Boston MA')
      expect(result.kind).toBe('maps')
    })

    it('does not falsely treat a physical address containing "teams" as virtual', () => {
      const result = locationLink('123 Teams Drive, Springfield')
      expect(result.kind).toBe('maps')
    })
  })

  describe('virtual meetings without a bare URL (Teams/Zoom/Meet labels)', () => {
    it('treats a "Microsoft Teams Meeting" label as virtual, not a physical address', () => {
      const result = locationLink('Microsoft Teams Meeting')
      expect(result.kind).toBe('virtual')
      expect(result.href).toBe('')
    })

    it('extracts a meeting URL embedded after a label', () => {
      const result = locationLink('Microsoft Teams Meeting https://teams.microsoft.com/l/meetup-join/xyz')
      expect(result.kind).toBe('url')
      expect(result.href).toBe('https://teams.microsoft.com/l/meetup-join/xyz')
    })

    it('uses the event meetingUrl when the location is a bare virtual label', () => {
      const result = locationLink('Microsoft Teams Meeting', null, 'https://teams.microsoft.com/l/meetup-join/abc')
      expect(result.kind).toBe('url')
      expect(result.href).toBe('https://teams.microsoft.com/l/meetup-join/abc')
    })

    it('treats a scheme-less "zoom.us" / "Zoom Meeting" label as virtual', () => {
      expect(locationLink('zoom.us').kind).toBe('virtual')
      expect(locationLink('Zoom Meeting').kind).toBe('virtual')
    })

    it('treats "Google Meet" and "Webex" labels as virtual', () => {
      expect(locationLink('Google Meet').kind).toBe('virtual')
      expect(locationLink('Webex').kind).toBe('virtual')
    })
  })

  describe('empty / missing inputs', () => {
    it('returns null kind for empty string', () => {
      const result = locationLink('')
      expect(result.kind).toBe('empty')
      expect(result.href).toBe('')
    })

    it('returns null kind for whitespace-only string', () => {
      const result = locationLink('   ')
      expect(result.kind).toBe('empty')
    })
  })
})
