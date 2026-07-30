// The wall's reduced action vocabulary.
//
// ProactiveSuggestionChips.handleClick dispatches tel:/sms:/mailto:/window.open.
// On the Raspberry Pi kiosk browser most of those do NOTHING, and a dead tap on a
// wall-mounted screen is worse than no chip at all. So the wall offers only what
// it can actually perform: its own phone flow, or "Show me".
//
// This filter lives HERE, in the wall adapter, not in the shared components, so
// the wall's limitations cannot leak into the phone and desktop paths.

import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { resolveSuggestionAction } from '@/lib/assistant/suggestionAction'

export type WallAction =
  | { kind: 'wall_call'; phoneNumber: string }
  | { kind: 'show_me' }

export function toWallAction(s: ProactiveSuggestion): WallAction {
  const action = resolveSuggestionAction(s)
  if (action.kind === 'call') {
    return { kind: 'wall_call', phoneNumber: action.phoneNumber }
  }
  // Everything else — email, text, links, maps, plan sessions — degrades to
  // revealing the item, which the wall CAN do via its action sheet.
  return { kind: 'show_me' }
}

export function wallActionLabel(action: WallAction): string {
  return action.kind === 'wall_call' ? 'Call' : 'Show me'
}
