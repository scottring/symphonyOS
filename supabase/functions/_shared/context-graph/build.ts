import { parseFacets } from '../facets.ts'
import type { BundleFact, BundleNote, BundleTime, ContextBundle } from './types.ts'
import { KNOWLEDGE_K, SIMILARITY_FLOOR } from './types.ts'

export function facetsToFacts(attachments: { id: string; facets: unknown }[]): BundleFact[] {
  const out: BundleFact[] = []
  for (const att of attachments) {
    if (!att.facets) continue
    for (const facet of parseFacets(att.facets)) out.push({ facet, attachmentId: att.id })
  }
  return out
}

export function boundKnowledge(notes: BundleNote[]): BundleNote[] {
  const seen = new Map<string, BundleNote>()
  for (const n of notes) {
    if (n.source === 'semantic' && (n.similarity ?? 0) < SIMILARITY_FLOOR) continue
    const existing = seen.get(n.id)
    if (!existing || (existing.source === 'semantic' && n.source === 'linked')) seen.set(n.id, n)
  }
  const all = [...seen.values()]
  const linked = all.filter(n => n.source === 'linked')
  const semantic = all.filter(n => n.source === 'semantic').sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
  return [...linked, ...semantic].slice(0, KNOWLEDGE_K)
}

export function buildTime(row: { scheduled_for: string | null; bucket: string | null; is_waiting: boolean | null; waiting_since: string | null; defer_count: number | null; created_at: string }, now: Date): BundleTime {
  const ageDays = Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 86400000)
  return {
    scheduledFor: row.scheduled_for ?? undefined,
    bucket: row.bucket ?? undefined,
    isWaiting: row.is_waiting ?? undefined,
    waitingSince: row.waiting_since ?? undefined,
    deferCount: row.defer_count ?? undefined,
    ageDays,
  }
}

export function renderBundleForPrompt(bundle: ContextBundle): string {
  const lines: string[] = [`ITEM [${bundle.entity.id}] "${bundle.entity.title}"`]
  if (bundle.entity.notes) lines.push(`notes: ${bundle.entity.notes.substring(0, 200)}`)
  if (bundle.time.isWaiting) lines.push(`WAITING${bundle.time.waitingSince ? ` since ${bundle.time.waitingSince.substring(0, 10)}` : ''}`)
  lines.push(`age: ${bundle.time.ageDays}d${bundle.time.deferCount ? `, deferred ${bundle.time.deferCount}x` : ''}`)
  if (bundle.people.length) lines.push(`PEOPLE: ${bundle.people.map(p => `${p.name} (${p.role}${p.phone ? ` phone:${p.phone}` : ''}${p.email ? ` email:${p.email}` : ''})`).join('; ')}`)
  if (bundle.lineage.projectName) lines.push(`PROJECT: ${bundle.lineage.projectName}${bundle.lineage.goalTitle ? ` → GOAL: ${bundle.lineage.goalTitle}` : ''}`)
  if (bundle.facts.length) lines.push(`ATTACHED FACTS: ${bundle.facts.map(f => JSON.stringify(f.facet)).join('; ')}`)
  if (bundle.knowledge.length) lines.push(`NOTES: ${bundle.knowledge.map(n => `[${n.title}] ${n.snippet}`).join(' | ')}`)
  if (bundle.history.length) lines.push(`HISTORY (already done — never re-suggest): ${bundle.history.map(h => `${h.actionType}${h.detail ? ` ${h.detail}` : ''}${h.outcome ? ` → ${h.outcome}` : ''} (${h.createdAt.substring(0, 10)})`).join('; ')}`)
  return lines.join('\n')
}
