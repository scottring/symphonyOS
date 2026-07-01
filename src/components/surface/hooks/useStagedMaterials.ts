// useStagedMaterials — the shared staging core (Phase 0).
//
// Flattens an item's already-linked context into a typed Material[] that both
// the Daily Plan (chips) and the Execution Wall (tiles) render. Most materials
// derive straight from the TimelineItem (which already carries phone, links,
// location, notes, collection steps). Anything that needs extra hydration —
// the contact behind a contactId, a meal's recipe, a source email thread — is
// passed in via StagingContext so this stays a pure, testable function with no
// data-fetching of its own.

import { useMemo } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Contact } from '@/types/contact'
import type { Material } from '@/types/material'
import { locationLink } from '@/lib/locationLink'
import { getVideoCallService } from '@/lib/actionDetection'

export interface StagingContext {
  /** Resolve a contactId → contact (for the phone number + person tile). */
  contactsById?: Record<string, Contact>
  /** A meal item's recipe, keyed by timeline item id, if available. */
  recipeByItemId?: Record<string, { id: string; title: string; ingredientCount?: number }>
  /** A source email thread linked to a task, keyed by timeline item id. */
  emailByItemId?: Record<string, { messageId: string; subject: string; from?: string }>
  /** Attachment count for an item (files), keyed by timeline item id. */
  attachmentCountByItemId?: Record<string, number>
}

/** Pure: derive the staged materials for one item. No hooks, fully testable. */
export function deriveMaterials(item: TimelineItem, ctx: StagingContext = {}): Material[] {
  const out: Material[] = []
  const contact = item.contactId ? ctx.contactsById?.[item.contactId] : undefined

  // 1. Phone — from the item's own number, or the linked contact's. AUTO.
  const phone = item.phoneNumber || contact?.phone
  if (phone) {
    out.push({
      id: 'phone',
      type: 'phone',
      icon: 'call',
      label: phone,
      sublabel: contact ? `Tap to call · ${contact.name}` : 'Tap to call',
      source: contact ? 'from Contacts' : 'on this item',
      action: { kind: 'call', value: phone },
      availability: 'auto',
    })
  }

  // 2. Person — the related contact (who the item is about). AUTO.
  if (contact) {
    out.push({
      id: 'person',
      type: 'person',
      icon: 'person',
      label: contact.name,
      sublabel: contact.category ? contact.category.replace(/_/g, ' ') : undefined,
      source: 'from Contacts',
      action: { kind: 'none' },
      availability: 'auto',
    })
  }

  // 3. Location — resolve to the right kind of material. A video meeting is not
  // a place: showing "Directions" would try to build a Maps route to the join
  // URL (or to "Microsoft Teams Meeting"). locationLink already classifies this,
  // so surface a "Join call" link for meetings and directions only for real
  // addresses. AUTO (we have the destination).
  if (item.location) {
    const link = locationLink(item.location, item.locationPlaceId, item.meetingUrl)
    const service = link.kind === 'url' ? getVideoCallService(link.href) : null
    if (service || link.kind === 'virtual') {
      out.push({
        id: 'video-call',
        type: 'link',
        icon: 'video',
        label: link.href ? 'Join call' : 'Video call',
        sublabel: service ?? (link.href ? undefined : item.location),
        source: 'from location',
        action: link.href ? { kind: 'href', value: link.href } : { kind: 'none' },
        availability: 'auto',
      })
    } else {
      out.push({
        id: 'directions',
        type: 'directions',
        icon: 'location',
        label: 'Directions',
        sublabel: item.location,
        source: item.locationPlaceId ? 'precise route' : 'from location',
        action: { kind: 'directions', value: item.locationPlaceId || item.location },
        availability: 'auto',
      })
    }
  }

  // 4. Links — each saved URL on the item. AUTO.
  for (const [i, link] of (item.links ?? []).entries()) {
    if (!link?.url) continue
    out.push({
      id: `link-${i}`,
      type: 'link',
      icon: 'attachment',
      label: link.title || link.url,
      sublabel: link.title ? undefined : 'Open link',
      source: 'linked',
      action: { kind: 'href', value: link.url },
      availability: 'auto',
    })
  }

  // 5. Files — attachment count (hydrated). AUTO when present.
  const fileCount = ctx.attachmentCountByItemId?.[item.id] ?? 0
  if (fileCount > 0) {
    out.push({
      id: 'files',
      type: 'file',
      icon: 'attachment',
      label: fileCount === 1 ? '1 file' : `${fileCount} files`,
      sublabel: 'Open attachments',
      source: 'attached',
      action: { kind: 'none' },
      availability: 'auto',
    })
  }

  // 6. Steps — routine collections (and routines with grouped steps). AUTO.
  const stepCount = item.collectionSteps?.length ?? 0
  if (item.type === 'routine-collection' && stepCount > 0) {
    out.push({
      id: 'steps',
      type: 'steps',
      icon: 'list',
      label: stepCount === 1 ? '1 step' : `${stepCount} steps`,
      sublabel: item.collectionNextUp ? `Next: ${item.collectionNextUp.stepName}` : undefined,
      source: 'routine',
      action: { kind: 'open-steps' },
      availability: 'auto',
    })
  }

  // 7. Recipe — meal items (hydrated). AUTO when present; grocery is PARTIAL.
  const recipe = ctx.recipeByItemId?.[item.id]
  if (recipe) {
    out.push({
      id: 'recipe',
      type: 'recipe',
      icon: 'list',
      label: recipe.title,
      sublabel: 'Recipe',
      source: 'Meal Plan',
      action: { kind: 'open-recipe', value: recipe.id },
      availability: 'auto',
    })
    out.push({
      id: 'grocery',
      type: 'grocery',
      icon: 'list',
      label: 'Shopping list',
      sublabel: recipe.ingredientCount ? `${recipe.ingredientCount} items` : undefined,
      source: 'Meal Plan',
      action: { kind: 'none' },
      availability: 'partial', // list derivation from ingredients not wired yet
    })
  }

  // 8. Email — source thread (hydrated). PARTIAL: surfacing not fully wired.
  const email = ctx.emailByItemId?.[item.id]
  if (email) {
    out.push({
      id: 'email',
      type: 'email',
      icon: 'email',
      label: email.subject || 'Source email',
      sublabel: email.from ? `from ${email.from}` : 'Open thread',
      source: 'from Email',
      action: { kind: 'open-email', value: email.messageId },
      availability: 'partial',
    })
  }

  return out
}

/** Memoized hook wrapper around deriveMaterials. */
export function useStagedMaterials(item: TimelineItem, ctx: StagingContext = {}): Material[] {
  return useMemo(() => deriveMaterials(item, ctx), [item, ctx])
}
