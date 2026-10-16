/** A card receipt must be backed by this turn's validated proposal event.
 * This is a narrow backstop for unsupported card claims, not an intent parser.
 * It never creates or applies changes itself. */
export function claimsPreparedCard(reply: string): boolean {
  const clauses = reply.replace(/[’]/g, "'").split(/(?<=[.!?;])|[\n—]/)
  return clauses.some(raw => {
    const text = raw.trim()
    if (!text || text.endsWith('?')) return false
    // Questions, conditional offers, and honest failures are not receipts.
    if (/\b(if|would|could|should|might|can|cannot|can't|couldn't|didn't|haven't|hasn't|isn't|aren't|not|never|unable)\b/i.test(text)) return false
    const card = '(?:the|a|your|this)\\s+(?:(?:change|review|draft|updated|new)\\s+)?card'
    return new RegExp('\\b(?:on|onto|in)\\s+' + card + '\\b', 'i').test(text)
      || /\b(?:card|plan)\s+(?:is\s+|looks\s+|now\s+)*(?:ready|updated|revised|prepared)\b/i.test(text)
      || /\b(?:created|prepared|updated|revised|built)\s+(?:(?:the|a|your|this)\s+)?(?:(?:change|review|draft)\s+)?card\b/i.test(text)
  })
}

export const PROPOSAL_REPAIR = `Application verification: no validated change card was produced in this turn. Your proposed answer claims that a card is ready or contains changes, so it cannot be delivered. Complete the missing symphony_propose_changes call using the user's actual requests and the whole pending list, preserving unchanged items and exact dates/times. Leave unspecified days undated. Do not create tasks directly or infer approval. If you cannot prepare the card, explain that honestly instead. This is one bounded repair attempt.`
export const PROPOSAL_FAILURE = 'I could not prepare the updated review card. Nothing from this proposal was saved. Your request is still in the conversation.'


export function proposalRepairToolAllowed(name: string): boolean {
  return name === 'symphony_propose_changes' || /^symphony_(read|get|list|search)_/.test(name)
}

/** Chat already displays the verified draft and its Not saved status. Avoid
 * repeating a receipt in every reply; the spoken wall still needs one. */
export function proposalReply(reply: string, surface: 'wall' | 'onboarding' | 'onboarding_activity' | null = null): string {
  if (surface !== 'wall') return reply.trim() || 'The draft is ready. Choose Save when you’re ready.'
  const receipt = 'The updated plan is ready to review. Nothing is saved until you approve.'
  if (!reply.trim()) return receipt
  if (/\b(?:nothing is saved|not (?:yet )?saved)\b/i.test(reply) && /\bapprov(?:e|al)\b/i.test(reply)) return reply
  return `${receipt} ${reply}`
}
