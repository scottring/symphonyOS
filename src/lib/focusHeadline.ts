export type ClarityState = 'excellent' | 'good' | 'fair' | 'needsAttention'

const CALM = 'Keep today simple and connected.'
const FOCUS = 'A few things need your attention today.'

/** Templated focus headline keyed to clarity state. Deterministic, not LLM. */
export function focusHeadline(state: ClarityState): string {
  if (state === 'fair' || state === 'needsAttention') return FOCUS
  return CALM
}
