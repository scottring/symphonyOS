import { describe, it, expect } from 'vitest'
import {
  readAuthCallbackError,
  withoutAuthCallbackError,
  describeResendError,
  SUPPORT_EMAIL,
} from './authCallback'

const ORIGIN = 'https://app.symphony-os.com'
// Verbatim shape of the link a beta user opened on 2026-10-08.
const EXPIRED_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

describe('readAuthCallbackError', () => {
  it('reads an expired link from the hash (implicit flow)', () => {
    expect(readAuthCallbackError(`${ORIGIN}/${EXPIRED_HASH}`)).toEqual({
      kind: 'expired',
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
    })
  })

  it('reads an expired link from the query (PKCE flow)', () => {
    const href = `${ORIGIN}/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    expect(readAuthCallbackError(href)?.kind).toBe('expired')
  })

  it('treats other stale-link codes as expired', () => {
    expect(readAuthCallbackError(`${ORIGIN}/#error_code=flow_state_expired&error_description=x`)?.kind).toBe('expired')
    expect(readAuthCallbackError(`${ORIGIN}/?error_code=flow_state_not_found&error_description=x`)?.kind).toBe('expired')
  })

  it('treats an unknown code as some other failure, keeping the description as text', () => {
    const href = `${ORIGIN}/#error=server_error&error_code=unexpected_failure&error_description=Something+broke+%3Cb%3Ehere%3C%2Fb%3E`
    expect(readAuthCallbackError(href)).toEqual({
      kind: 'other',
      code: 'unexpected_failure',
      description: 'Something broke <b>here</b>',
    })
  })

  it('caps a very long description', () => {
    const href = `${ORIGIN}/#error_code=weird&error_description=${'a'.repeat(1000)}`
    expect(readAuthCallbackError(href)?.description).toHaveLength(200)
  })

  it('ignores a successful callback', () => {
    expect(readAuthCallbackError(`${ORIGIN}/#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=signup`)).toBeNull()
    expect(readAuthCallbackError(`${ORIGIN}/?code=pkce-code`)).toBeNull()
  })

  it('ignores ordinary URLs and a bare ?error= that is not from auth', () => {
    expect(readAuthCallbackError(`${ORIGIN}/today`)).toBeNull()
    expect(readAuthCallbackError(`${ORIGIN}/?return=/week`)).toBeNull()
    expect(readAuthCallbackError(`${ORIGIN}/?error=access_denied`)).toBeNull()
    expect(readAuthCallbackError(`${ORIGIN}/#section`)).toBeNull()
  })
})

describe('withoutAuthCallbackError', () => {
  it('removes the error from the hash, leaving a clean URL', () => {
    expect(withoutAuthCallbackError(`${ORIGIN}/${EXPIRED_HASH}&sb=`)).toBe(`${ORIGIN}/`)
  })

  it('removes the error from the query but keeps unrelated params and the path', () => {
    expect(
      withoutAuthCallbackError(`${ORIGIN}/week?return=/today&error=access_denied&error_code=otp_expired&error_description=x`)
    ).toBe(`${ORIGIN}/week?return=%2Ftoday`)
  })

  it('leaves a URL with nothing to remove exactly as it was', () => {
    const href = `${ORIGIN}/today?return=/week#section`
    expect(withoutAuthCallbackError(href)).toBe(href)
  })
})

describe('describeResendError', () => {
  it('turns the wait-N-seconds limit into a plain instruction', () => {
    expect(
      describeResendError({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429 })
    ).toBe('Please wait 42 seconds, then try again.')
  })

  it('explains the email rate limit', () => {
    expect(describeResendError({ message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' }))
      .toMatch(/Too many emails .* Wait a few minutes/)
  })

  it('explains a malformed address', () => {
    expect(describeResendError({ message: 'Unable to validate email address: invalid format', code: 'validation_failed' }))
      .toMatch(/complete email address/)
  })

  it('explains being offline', () => {
    expect(describeResendError({ message: 'Failed to fetch', name: 'AuthRetryableFetchError' }))
      .toMatch(/couldn't reach Symphony/)
  })

  it('falls back to a plain message with the support address, never the raw text', () => {
    const text = describeResendError({ message: 'pq: relation "x" does not exist', status: 500 })
    expect(text).toContain(SUPPORT_EMAIL)
    expect(text).not.toContain('relation')
  })
})
