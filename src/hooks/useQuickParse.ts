import { useEffect, useMemo, useState } from 'react'
import { parseQuickInput, hasParsedFields, type ParsedQuickInput, type ParserContext } from '@/lib/quickInputParser'
import { resolveContact, type ResolverContext, type ContactSuggestion } from '@/lib/entityResolver'
import type { TaskCategory, TaskContext } from '@/types/task'

type Domain = 'work' | 'family' | 'personal' | 'universal'

/**
 * Parsed quick-input merged with per-field user overrides. Adds `context`
 * (auto-applied domain context) on top of the raw parser result.
 */
export type EffectiveParsed = ParsedQuickInput & {
  category?: TaskCategory
  context?: TaskContext
}

// Tri-state per field: null = explicitly cleared by user, absent/undefined = fall back to parsed value.
interface Overrides {
  projectId?: string | null
  contactId?: string | null
  dueDate?: Date | null
  category?: TaskCategory | null
  context?: TaskContext | null
  assignedMemberIds?: string[] | null
}

export type SuggestionState = 'none' | 'accepted' | 'dismissed'

/**
 * Parse a quick-capture title into structured fields, with per-field user overrides.
 *
 * `ctx` MUST be referentially stable / memoized by the caller. Its identity is a
 * dependency of the parse memo — an inline object literal will cause a full re-parse
 * on every render.
 *
 * `resolver` is optional. When provided, an implicit contact will be suggested
 * when no explicit @mention syntax matched. When omitted, behavior is identical
 * to before — no suggestion is surfaced.
 */
export function useQuickParse(title: string, ctx: ParserContext, currentDomain: Domain, resolver?: ResolverContext) {
  const [overrides, setOverrides] = useState<Overrides>({})
  const [suggestionState, setSuggestionState] = useState<SuggestionState>('none')

  const parsed = useMemo<ParsedQuickInput>(
    () => parseQuickInput(title, ctx),
    [title, ctx],
  )

  // Compute an implicit contact suggestion — only when no explicit contact was parsed
  // and a resolver was provided.
  const suggestion = useMemo<ContactSuggestion | null>(() => {
    if (!resolver || parsed.contactId || !title.trim()) return null
    return resolveContact(parsed.title || title, resolver)
  }, [resolver, parsed.contactId, parsed.title, title])

  // Reset the suggestion interaction state whenever the target contact changes.
  useEffect(() => {
    setSuggestionState('none')
  }, [suggestion ? `${suggestion.contactId}:${suggestion.band}` : '']) // eslint-disable-line react-hooks/exhaustive-deps

  // A suggestion is "applied" (i.e. flows into effectiveParsed.contactId) when:
  // - it exists and hasn't been dismissed, AND
  // - it is apply-band OR the user explicitly accepted it (for ghost-band suggestions)
  const suggestionApplied =
    !!suggestion &&
    suggestionState !== 'dismissed' &&
    (suggestion.band === 'apply' || suggestionState === 'accepted')

  const effectiveParsed = useMemo(() => ({
    ...parsed,
    projectId: overrides.projectId === null ? undefined : (overrides.projectId ?? parsed.projectId),
    contactId: overrides.contactId === null ? undefined : (overrides.contactId ?? parsed.contactId ?? (suggestionApplied ? suggestion!.contactId : undefined)),
    dueDate: overrides.dueDate === null ? undefined : (overrides.dueDate ?? parsed.dueDate),
    category: overrides.category === null ? undefined : (overrides.category ?? parsed.category),
    context: overrides.context === null ? undefined : (overrides.context ?? (currentDomain !== 'universal' ? currentDomain as TaskContext : undefined)),
    assignedMemberIds: overrides.assignedMemberIds === null ? undefined : (overrides.assignedMemberIds ?? parsed.assignedMemberIds),
  }), [parsed, overrides, currentDomain, suggestionApplied, suggestion])

  const hasFields = hasParsedFields(effectiveParsed) || !!effectiveParsed.context

  const projectName = useMemo(
    () => (effectiveParsed.projectId ? ctx.projects.find(p => p.id === effectiveParsed.projectId)?.name ?? null : null),
    [effectiveParsed.projectId, ctx.projects],
  )

  const contactName = useMemo(() => {
    if (!effectiveParsed.contactId) return null
    // When the suggestion is the source of the contactId, use the suggestion's name directly
    if (suggestionApplied && suggestion && effectiveParsed.contactId === suggestion.contactId) {
      return suggestion.contactName
    }
    return ctx.contacts.find(c => c.id === effectiveParsed.contactId)?.name ?? null
  }, [effectiveParsed.contactId, ctx.contacts, suggestionApplied, suggestion])

  return {
    effectiveParsed,
    hasFields,
    projectName,
    contactName,
    suggestion,
    suggestionState,
    suggestionApplied,
    acceptSuggestion: () => setSuggestionState('accepted'),
    dismissSuggestion: () => setSuggestionState('dismissed'),
    resetSuggestion: () => setSuggestionState('none'),
    resetOverrides: () => setOverrides({}),
    clearProject: () => setOverrides(prev => ({ ...prev, projectId: null })),
    clearContact: () => setOverrides(prev => ({ ...prev, contactId: null })),
    clearDate: () => setOverrides(prev => ({ ...prev, dueDate: null })),
    clearCategory: () => setOverrides(prev => ({ ...prev, category: null })),
    clearContext: () => setOverrides(prev => ({ ...prev, context: null })),
    clearAssignment: () => setOverrides(prev => ({ ...prev, assignedMemberIds: null })),
    applyContext: (c: TaskContext) => setOverrides(prev => ({ ...prev, context: c })),
  }
}
