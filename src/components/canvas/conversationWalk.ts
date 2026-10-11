// src/components/canvas/conversationWalk.ts
//
// The page's "Plan this season with me" lives in the conversation bar, which
// the shell renders. The page names it (label + the opening message); the bar
// shows it beside the field (approved Season board, 2026-10-10).

import { createContext, useContext, useEffect } from 'react'

export interface ConversationWalk {
  label: string
  message: string
}

export const ConversationWalkContext = createContext<((walk: ConversationWalk | null) => void) | null>(null)

/** Offer this walk in the conversation bar while the page is mounted.
 *  Returns false where no bar hosts it (phones), so the page shows its own. */
export function useConversationWalk(walk: ConversationWalk | null): boolean {
  const set = useContext(ConversationWalkContext)
  const label = walk?.label, message = walk?.message
  useEffect(() => {
    if (!set) return
    set(label && message ? { label, message } : null)
    return () => set(null)
  }, [set, label, message])
  return !!set
}
