/** Expiry rule for shelf documents. Deliberately carries only the label and
 *  the date — never facet content — so a renewal nudge can never become a
 *  vector for the document's own contents. */

export const EXPIRY_WARNING_DAYS = 60
const MS_PER_DAY = 86_400_000

export interface DocumentRow {
  id: string
  document_label: string | null
  document_kind: string | null
  document_expires_on: string | null
}

export interface DocumentSuggestion {
  entity_type: 'document'
  entity_id: string
  suggestion_type: 'renew'
  title: string
  detail: string
  confidence: number
  action_type: 'open_documents'
  action_payload: Record<string, unknown>
  suggestion_key: string
  urgency: number
}

function daysUntil(expiresOn: string, today: Date): number | null {
  const then = Date.parse(`${expiresOn}T00:00:00Z`)
  if (Number.isNaN(then)) return null
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((then - now) / MS_PER_DAY)
}

export function documentExpirySuggestions(
  docs: DocumentRow[],
  today: Date = new Date(),
): DocumentSuggestion[] {
  const out: DocumentSuggestion[] = []
  for (const d of docs) {
    if (!d.document_expires_on) continue
    const days = daysUntil(d.document_expires_on, today)
    if (days === null || days > EXPIRY_WARNING_DAYS) continue

    const label = d.document_label ?? 'A document'
    const expired = days < 0
    out.push({
      entity_type: 'document',
      entity_id: d.id,
      suggestion_type: 'renew',
      title: expired ? `${label} has expired` : `${label} expires in ${days} days`,
      detail: expired ? 'Renew it when you get a chance.' : `Expires ${d.document_expires_on}.`,
      confidence: 0.9,
      action_type: 'open_documents',
      action_payload: { documentId: d.id },
      suggestion_key: `document:${d.id}:expiry`,
      // Expired outranks expiring; inside the window urgency rises as the date nears.
      urgency: expired ? 0.95 : 0.5 + 0.3 * (1 - days / EXPIRY_WARNING_DAYS),
    })
  }
  return out
}
