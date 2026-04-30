/** Local types for the AskSymphony rail (Surface 5).
 *  These mirror the AskSymphonySuggestion / AskSymphonyMessage shapes from
 *  `useAskSymphony` so the rail can render them without coupling the
 *  presentational components to the hook. */

import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'

/** Re-export so `<SuggestionCard suggestion={...} />` callers can import
 *  `Suggestion` from the chat barrel as before. */
export type Suggestion = AskSymphonySuggestion

/** Conversation message — either a user bubble or the AI body with attached suggestions. */
export type Message =
  | { role: 'user'; id: string; text: string }
  | { role: 'ai'; id: string; text: string; suggestions?: Suggestion[] }
