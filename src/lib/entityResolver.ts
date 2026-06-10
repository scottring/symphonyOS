// src/lib/entityResolver.ts
import Fuse from 'fuse.js'

export interface ResolverContact {
  id: string
  name: string
  phone?: string
}

export interface EntityAlias {
  aliasNormalized: string
  entityType: 'contact' | 'project'
  entityId: string
}

export interface ResolverContext {
  contacts: ResolverContact[]
  aliases: EntityAlias[]
}

export type SuggestionTier = 'alias' | 'containment' | 'fuzzy'
export type SuggestionBand = 'apply' | 'ghost'

export interface ContactSuggestion {
  contactId: string
  contactName: string
  phone?: string
  /** The normalized text that matched — stored as the alias on accept. */
  matchedText: string
  score: number
  tier: SuggestionTier
  band: SuggestionBand
  callIntent: boolean
}

const CALL_INTENT_VERBS = ['call', 'phone', 'text']
const LEAD_VERBS = [...CALL_INTENT_VERBS, 'email', 'visit', 'see', 'pick up']

const APPLY_THRESHOLD = 0.9
const GHOST_THRESHOLD = 0.6
const TIE_MARGIN = 0.05
const MIN_FUZZY_CHARS = 5
const FUSE_OPTIONS = { keys: ['name'], includeScore: true, threshold: 0.35, ignoreLocation: true }

export function normalizeEntityText(s: string): string {
  return s.toLowerCase().replace(/[.,!?'"]/g, '').replace(/\s+/g, ' ').trim()
}

function stripLeadVerb(normalized: string): { candidate: string; callIntent: boolean } {
  // Longest verbs first so "pick up" wins over a hypothetical "pick".
  const verbs = [...LEAD_VERBS].sort((a, b) => b.length - a.length)
  for (const verb of verbs) {
    if (normalized === verb) return { candidate: '', callIntent: CALL_INTENT_VERBS.includes(verb) }
    if (normalized.startsWith(verb + ' ')) {
      return { candidate: normalized.slice(verb.length + 1), callIntent: CALL_INTENT_VERBS.includes(verb) }
    }
  }
  return { candidate: normalized, callIntent: false }
}

/** Contiguous word n-grams, longest first (longer matches are more specific). */
function ngrams(text: string, maxN = 4): string[] {
  const words = text.split(' ').filter(Boolean)
  const grams: string[] = []
  for (let n = Math.min(maxN, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) grams.push(words.slice(i, i + n).join(' '))
  }
  return grams
}

// Fuse index cache keyed on the contacts array identity (stores are referentially
// stable between data changes), so per-keystroke resolution doesn't rebuild it.
const fuseCache = new WeakMap<ResolverContact[], Fuse<ResolverContact>>()
function getFuse(contacts: ResolverContact[]): Fuse<ResolverContact> {
  let fuse = fuseCache.get(contacts)
  if (!fuse) {
    fuse = new Fuse(contacts, FUSE_OPTIONS)
    fuseCache.set(contacts, fuse)
  }
  return fuse
}

export function resolveContact(title: string, ctx: ResolverContext): ContactSuggestion | null {
  const normalized = normalizeEntityText(title)
  if (!normalized) return null
  const { candidate, callIntent } = stripLeadVerb(normalized)
  if (!candidate) return null

  const byId = new Map(ctx.contacts.map((c) => [c.id, c]))
  const suggestion = (
    c: ResolverContact, matchedText: string, score: number, tier: SuggestionTier, band: SuggestionBand,
  ): ContactSuggestion => ({
    contactId: c.id, contactName: c.name, phone: c.phone, matchedText, score, tier, band, callIntent,
  })

  // Tier 1 — learned aliases (score 1.0, pre-apply)
  const aliasMap = new Map(
    ctx.aliases.filter((a) => a.entityType === 'contact').map((a) => [a.aliasNormalized, a.entityId]),
  )
  for (const gram of ngrams(candidate)) {
    const entityId = aliasMap.get(gram)
    const c = entityId ? byId.get(entityId) : undefined
    if (c) return suggestion(c, gram, 1, 'alias', 'apply')
  }

  // Tier 2 — full-name containment (score 0.95, pre-apply)
  for (const c of ctx.contacts) {
    const name = normalizeEntityText(c.name)
    if (name.length >= 3 && candidate.includes(name)) {
      return suggestion(c, name, 0.95, 'containment', 'apply')
    }
  }

  // Tier 3 — fuzzy (band by score; ties never pre-apply)
  if (candidate.length < MIN_FUZZY_CHARS) return null
  const fuse = getFuse(ctx.contacts)
  const bestPerContact = new Map<string, { c: ResolverContact; score: number; gram: string }>()
  for (const gram of ngrams(candidate)) {
    // Require at least 2 words for fuzzy: single-word partial matches (e.g. "guitar"
    // matching "Macmillan Guitars") produce spurious high scores via substring alignment.
    if (gram.length < MIN_FUZZY_CHARS || gram.split(' ').length < 2) continue
    for (const r of fuse.search(gram)) {
      const score = 1 - (r.score ?? 1)
      const prev = bestPerContact.get(r.item.id)
      if (!prev || score > prev.score) bestPerContact.set(r.item.id, { c: r.item, score, gram })
    }
  }
  const ranked = [...bestPerContact.values()].sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.score < GHOST_THRESHOLD) return null
  const second = ranked[1]
  const tie = !!second && best.score - second.score < TIE_MARGIN
  const band: SuggestionBand = !tie && best.score >= APPLY_THRESHOLD ? 'apply' : 'ghost'
  return suggestion(best.c, best.gram, best.score, 'fuzzy', band)
}
