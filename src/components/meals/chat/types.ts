/** Local types for the AskSymphony rail (Surface 5).
 *  These describe the stub message + suggestion shape — the real
 *  LLM/agent integration will refine or replace these. */

/** A swap suggestion shown as a card under an AI body. */
export interface Suggestion {
  id: string
  /** Small uppercase kicker above the body, e.g. "Tuesday dinner — Kid-friendly swap". */
  kicker: string
  /** What's currently planned, e.g. "Bittman shrimp (broiled)". Bold portion is the recipe name. */
  originalLabel: string
  originalRecipe: string
  /** The proposed swap, e.g. "Creamy lemon shrimp pasta with peas". */
  switchLabel: string
  switchRecipe: string
  /** Italic justification line. */
  why: string
}

/** Conversation message — either a user bubble or the AI body with attached suggestions. */
export type Message =
  | { role: 'user'; id: string; text: string }
  | { role: 'ai'; id: string; text: string; suggestions?: Suggestion[] }
