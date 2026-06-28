// A "staged material" — a tool or piece of context auto-attached to an item so
// it's ready at the moment of execution (Symphony's core promise). The Daily
// Plan renders these as chips; the Execution Wall renders them as one-tap tiles.
// Both screens consume the same Material[] from useStagedMaterials.

import type { ConceptName } from '@/lib/conceptIcons'

export type MaterialType =
  | 'phone' // a callable number
  | 'directions' // a place to navigate to
  | 'email' // a source email thread
  | 'file' // an attachment
  | 'link' // a saved URL
  | 'recipe' // a meal's recipe
  | 'grocery' // a meal's shopping list
  | 'steps' // a routine/collection step list
  | 'person' // the related contact
  | 'goal' // the goal this item advances

/**
 * Whether the material was auto-derived from existing data (`auto`), is one
 * field away and surfaced as an "ask once" prompt (`partial`), or is a true gap
 * the user must fill manually (`manual`). Drives whether the UI shows a filled
 * tappable chip, an amber prompt, or a quiet "+ Add".
 */
export type MaterialAvailability = 'auto' | 'partial' | 'manual'

/** The one-tap behavior a material exposes. `value` is interpreted per `kind`. */
export interface MaterialAction {
  kind:
    | 'call' // value = phone number (tel: or Symphony-placed call)
    | 'href' // value = url to open
    | 'directions' // value = destination (location string or place id)
    | 'open-recipe' // value = recipe/entry id
    | 'open-steps' // open the item's step list inline
    | 'open-email' // value = email message id
    | 'none'
  value?: string
}

export interface Material {
  /** Stable id within an item's material set (for React keys). */
  id: string
  type: MaterialType
  /** Concept icon name — keeps us on the single no-emoji icon source. */
  icon: ConceptName
  label: string
  sublabel?: string
  /** Human-readable provenance, e.g. "from Contacts" / "linked doc". */
  source: string
  action: MaterialAction
  availability: MaterialAvailability
}
