// One Plan-from-paper import, kept in localStorage per user so a failed
// reading, a closed tab or a sign-out never loses the photos, the user's
// explanation, the proposal or the conversation. Row ids are fixed here, when
// an item is first proposed, so a retried save cannot make a second copy.
import type { Analysis } from '../../../supabase/functions/plan-from-paper/lib/plan'
import type { DomainId } from '@/lib/domains'
import { defaultInclude } from './savePlan'

export interface PaperImage {
  /** `<uid>/paper-plan/<importId>/<name>.jpg` */
  path: string
  /** The whole photo, or one half of a two-page spread. */
  part: 'whole' | 'left' | 'right'
  bytes: number
  attachmentId: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  changes?: string[]
}

export interface PaperImport {
  version: 1
  id: string
  createdAt: string
  images: PaperImage[]
  instructions: string
  domain: DomainId
  analysis: Analysis | null
  include: Record<string, boolean>
  rowIds: Record<string, string>
  sourceNoteId: string
  chat: ChatTurn[]
  /** Set once the save completed; the import is then read-only. */
  savedAt: string | null
}

const key = (userId: string) => `symphony.paperPlan.v1.${userId}`

export function newImport(domain: DomainId): PaperImport {
  return {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    images: [],
    instructions: '',
    domain,
    analysis: null,
    include: {},
    rowIds: {},
    sourceNoteId: crypto.randomUUID(),
    chat: [],
    savedAt: null,
  }
}

export function loadImport(userId: string): PaperImport | null {
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return null
    const v = JSON.parse(raw) as PaperImport
    return v && v.version === 1 && typeof v.id === 'string' && Array.isArray(v.images) ? v : null
  } catch {
    return null
  }
}

export function storeImport(userId: string, imp: PaperImport | null): void {
  try {
    if (imp) localStorage.setItem(key(userId), JSON.stringify(imp))
    else localStorage.removeItem(key(userId))
  } catch {
    // Private mode / quota: the import still works for this visit.
  }
}

/**
 * Adopt a new proposal (a first reading or a revision): every item keeps the
 * row id and include choice it already had, and a newly proposed item gets a
 * fresh row id and the default choice.
 */
export function withAnalysis(imp: PaperImport, analysis: Analysis): PaperImport {
  const ids = new Set(analysis.items.map((i) => i.id))
  const rowIds: Record<string, string> = {}
  const include: Record<string, boolean> = {}
  for (const item of analysis.items) {
    rowIds[item.id] = imp.rowIds[item.id] ?? crypto.randomUUID()
    include[item.id] = item.id in imp.include ? imp.include[item.id] : defaultInclude(item, ids)
  }
  return { ...imp, analysis, rowIds, include }
}
