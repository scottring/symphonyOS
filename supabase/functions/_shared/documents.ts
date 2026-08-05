/** Edge-side document vocabulary — twin of src/types/document.ts.
 *  Keep the two in sync. */
import type { Facet } from './facets.ts'

export const DOCUMENT_KINDS = [
  'drivers_license', 'passport', 'birth_certificate', 'social_security_card',
  'insurance_card', 'vehicle_registration', 'vehicle_title', 'medical_record',
  'tax_document', 'bank_document', 'warranty', 'receipt', 'contract', 'other',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
export type DocumentStatus = 'proposed' | 'kept' | 'dismissed'
export type DocumentScope = 'private' | 'household'

/** Kinds whose own contents must never be transcribed into `facets`.
 *  Facets flow into the context graph and on to the assistant prompt
 *  (supabase/functions/_shared/context-graph/build.ts), so an extracted
 *  ID number would become a durable, searchable fact. */
export const SENSITIVE_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>([
  'drivers_license', 'passport', 'birth_certificate', 'social_security_card',
  'insurance_card', 'vehicle_title', 'medical_record', 'tax_document', 'bank_document',
])

const KIND_LABELS: Record<DocumentKind, string> = {
  drivers_license: "Driver's license",
  passport: 'Passport',
  birth_certificate: 'Birth certificate',
  social_security_card: 'Social Security card',
  insurance_card: 'Insurance card',
  vehicle_registration: 'Vehicle registration',
  vehicle_title: 'Vehicle title',
  medical_record: 'Medical record',
  tax_document: 'Tax document',
  bank_document: 'Bank document',
  warranty: 'Warranty',
  receipt: 'Receipt',
  contract: 'Contract',
  other: 'Document',
}

export function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(v)
}

export function documentKindLabel(kind: DocumentKind): string {
  return KIND_LABELS[kind]
}

/** Reduce a sensitive document's facets to a single kind-derived summary.
 *  Non-sensitive kinds pass through untouched.
 *
 *  Applied server-side BEFORE the row write, not at render time — the
 *  guarantee is that the value never lands in the database at all. The model
 *  is asked to withhold; this is what enforces it. */
export function stripSensitive(facets: Facet[], kind: DocumentKind): Facet[] {
  if (!SENSITIVE_KINDS.has(kind)) return facets
  return [{ type: 'summary', text: KIND_LABELS[kind] }]
}

export interface DocumentProposal {
  kind: DocumentKind
  label: string
  owner: string | null
  expiresOn: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Parse the `document` block the vision model returns. Anything malformed
 *  degrades to null ("not a document") rather than throwing. */
export function parseDocumentProposal(raw: unknown): DocumentProposal | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  if (!isDocumentKind(d.kind)) return null
  const expiresOn = str(d.expires_on)
  return {
    kind: d.kind,
    label: str(d.label) ?? KIND_LABELS[d.kind],
    owner: str(d.owner),
    expiresOn: expiresOn && ISO_DATE.test(expiresOn) ? expiresOn : null,
  }
}
