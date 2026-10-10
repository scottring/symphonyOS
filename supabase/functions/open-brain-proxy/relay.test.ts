import { describe, expect, it } from 'vitest'
import { isOwner, relayPath } from './relay'

describe('relayPath', () => {
  it('maps the function path to the Open Brain route Symphony calls', () => {
    expect(relayPath('/open-brain-proxy/api/notes/tasks')).toBe('/api/notes/tasks')
    expect(relayPath('/functions/v1/open-brain-proxy/api/voice/transcribe')).toBe('/api/voice/transcribe')
    expect(relayPath('/open-brain-proxy/api/messages/contact/%2B15551234567')).toBe('/api/messages/contact/%2B15551234567')
    expect(relayPath('/open-brain-proxy/api/health')).toBe('/api/health')
  })

  it('refuses routes Symphony does not use', () => {
    for (const p of ['/api/upload', '/api/attachments/x.png', '/api/dataview', '/api/projects', '/api/today', '/api/meetings', '/', '/api', '/api/notesx'])
      expect(relayPath(`/open-brain-proxy${p}`)).toBeNull()
  })

  it('refuses traversal, raw or encoded', () => {
    expect(relayPath('/open-brain-proxy/api/notes/../upload')).toBeNull()
    expect(relayPath('/open-brain-proxy/api/notes/%2e%2e/upload')).toBeNull()
    expect(relayPath('/open-brain-proxy/api/notes//x')).toBeNull()
    expect(relayPath('/open-brain-proxy/api/notes/%5c')).toBeNull()
    expect(relayPath('/open-brain-proxy/api/notes/%E0%A4%A')).toBeNull()
  })
})

describe('isOwner', () => {
  it('lets through only the configured owner', () => {
    expect(isOwner('u1', 'u1')).toBe(true)
    expect(isOwner('u2', 'u1')).toBe(false)
    expect(isOwner(undefined, 'u1')).toBe(false)
    expect(isOwner('u1', undefined)).toBe(false)
    expect(isOwner('', '')).toBe(false)
  })
})
