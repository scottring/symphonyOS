import { useMemo, useState } from 'react'
import { parseQuickInput, hasParsedFields, type ParsedQuickInput, type ParserContext } from '@/lib/quickInputParser'
import type { TaskCategory, TaskContext } from '@/types/task'

type Domain = 'work' | 'family' | 'personal' | 'universal'

interface Overrides {
  projectId?: string | null
  contactId?: string | null
  dueDate?: Date | null
  category?: TaskCategory | null
  context?: TaskContext | null
  assignedMemberIds?: string[] | null
}

export function useQuickParse(title: string, ctx: ParserContext, currentDomain: Domain) {
  const [overrides, setOverrides] = useState<Overrides>({})

  const parsed = useMemo<ParsedQuickInput>(
    () => parseQuickInput(title, ctx),
    [title, ctx],
  )

  const effectiveParsed = useMemo(() => ({
    ...parsed,
    projectId: overrides.projectId === null ? undefined : (overrides.projectId ?? parsed.projectId),
    contactId: overrides.contactId === null ? undefined : (overrides.contactId ?? parsed.contactId),
    dueDate: overrides.dueDate === null ? undefined : (overrides.dueDate ?? parsed.dueDate),
    category: overrides.category === null ? undefined : (overrides.category ?? parsed.category),
    context: overrides.context === null ? undefined : (overrides.context ?? (currentDomain !== 'universal' ? currentDomain as TaskContext : undefined)),
    assignedMemberIds: overrides.assignedMemberIds === null ? undefined : (overrides.assignedMemberIds ?? parsed.assignedMemberIds),
  }), [parsed, overrides, currentDomain])

  const hasFields = hasParsedFields(effectiveParsed) || !!effectiveParsed.context

  const projectName = useMemo(
    () => (effectiveParsed.projectId ? ctx.projects.find(p => p.id === effectiveParsed.projectId)?.name ?? null : null),
    [effectiveParsed.projectId, ctx.projects],
  )
  const contactName = useMemo(
    () => (effectiveParsed.contactId ? ctx.contacts.find(c => c.id === effectiveParsed.contactId)?.name ?? null : null),
    [effectiveParsed.contactId, ctx.contacts],
  )

  return {
    effectiveParsed,
    hasFields,
    projectName,
    contactName,
    setOverride: (patch: Overrides) => setOverrides(prev => ({ ...prev, ...patch })),
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
