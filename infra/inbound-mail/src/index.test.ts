import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from './index'
import type { Env } from './handler'

function streamFromString(s: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(s)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

// postal-mime is lenient about malformed byte content (it never throws on
// plain garbage bytes — it just parses out empty fields), so the reliable
// way to exercise an actually-unparseable message is a raw stream that
// errors while being read, e.g. a truncated/corrupted delivery from
// Cloudflare's email pipeline.
function erroringStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error('corrupted stream'))
    },
  })
}

const env: Env = { SUPABASE_URL: 'https://x.supabase.co', CAPTURE_SHARED_SECRET: 's3cret' }

function fakeMessage(raw: ReadableStream<Uint8Array>): ForwardableEmailMessage {
  return {
    raw,
    to: 'a1b2c3d4e5f60718@symphony-os.com',
    from: 'news@hillside.org',
    headers: new Headers(),
    reply: vi.fn(),
    forward: vi.fn(),
    setReject: vi.fn(),
  } as unknown as ForwardableEmailMessage
}

describe('default email handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never replies/forwards/rejects and POSTs to inbound-email for a valid message', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    const message = fakeMessage(
      streamFromString(
        'From: Hillside Elementary <news@hillside.org>\r\n' +
          'To: a1b2c3d4e5f60718@symphony-os.com\r\n' +
          'Subject: Weekly Update\r\n' +
          'Content-Type: text/plain\r\n' +
          '\r\n' +
          'Picture Day is Thursday.\r\n',
      ),
    )

    await handler.email(message, env)

    expect(message.reply).not.toHaveBeenCalled()
    expect(message.forward).not.toHaveBeenCalled()
    expect(message.setReject).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/inbound-email', expect.anything())
  })

  it('drops an unparseable message without throwing and without sending', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    const message = fakeMessage(erroringStream())

    await expect(handler.email(message, env)).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(message.reply).not.toHaveBeenCalled()
    expect(message.forward).not.toHaveBeenCalled()
    expect(message.setReject).not.toHaveBeenCalled()
  })
})
