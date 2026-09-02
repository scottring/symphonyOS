import PostalMime from 'postal-mime'
import { buildPayload, deliver, type Env } from './handler'

// Receive-only. This Worker never calls message.reply() or message.forward():
// a bounce to a spoofed sender is backscatter, and a forward would leak the
// household's mail. Unknown recipients are dropped silently.
export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const parsed = await new PostalMime().parse(message.raw)
    const payload = buildPayload(
      { messageId: parsed.messageId, from: parsed.from, subject: parsed.subject, text: parsed.text, html: parsed.html },
      message.to,
      new Date(),
    )
    if (!payload) return
    await deliver(payload, env)
  },
}
