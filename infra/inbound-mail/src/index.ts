import PostalMime from 'postal-mime'
import { buildPayload, deliver, type Env } from './handler'

// Receive-only. This Worker never calls message.reply() or message.forward():
// a bounce to a spoofed sender is backscatter, and a forward would leak the
// household's mail. Unknown recipients are dropped silently.
export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    let parsed: Awaited<ReturnType<InstanceType<typeof PostalMime>['parse']>>
    try {
      parsed = await new PostalMime().parse(message.raw)
    } catch {
      // A malformed MIME message is a permanent failure, not a transient one:
      // rethrowing here would make Cloudflare (and the sender's MTA) retry
      // forever. Drop it silently, same as an unknown recipient.
      console.warn('inbound-mail: unparseable message dropped', { to: message.to })
      return
    }
    const payload = buildPayload(
      { messageId: parsed.messageId, from: parsed.from, subject: parsed.subject, text: parsed.text, html: parsed.html },
      message.to,
      new Date(),
    )
    if (!payload) return
    await deliver(payload, env)
  },
}
