// src/lib/discussions/composer.ts
//
// What the member meant by what they typed. Symphony never speaks unless
// invited, and the invitation is either the Ask Symphony button (the caller
// passes `ask` directly) or a message that opens with "@Symphony". The mention
// is stripped before the message is stored: the thread shows "plan this", not
// "@Symphony plan this", and the model sees the clean question.

export type ComposerIntent = { kind: 'post' | 'ask'; text: string }

const MENTION = /^\s*@symphony\b[\s:,—-]*/i

/** True while the draft opens with "@Symphony" — drives the composer hint. */
export function mentionsSymphony(raw: string): boolean {
  return MENTION.test(raw)
}

export function parseComposer(raw: string): ComposerIntent {
  if (mentionsSymphony(raw)) {
    return { kind: 'ask', text: raw.replace(MENTION, '').trim() }
  }
  return { kind: 'post', text: raw.trim() }
}
