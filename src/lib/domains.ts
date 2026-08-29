//
// THE list of domains. A domain is a layer you can tick on or off (like a
// Google calendar) AND the unit of sharing: `shared: true` means every
// household member subscribes to it. Nothing else in src/ may enumerate the
// three ids for UI purposes — iterate DOMAINS, so a `domains` table can
// replace this file later without touching every surface.
import { Briefcase, Users, User, Inbox, type LucideIcon } from 'lucide-react'
import type { TaskContext } from '@/types/task'

export type DomainId = TaskContext
export const UNSORTED = 'unsorted' as const
/** A pickable layer: a real domain, or the pseudo-layer for `context IS NULL`. */
export type Layer = DomainId | typeof UNSORTED

export interface DomainDef {
  id: DomainId
  label: string
  icon: LucideIcon
  /** Dot / accent colour (CSS rgb). */
  color: string
  /** Tailwind classes for the page tint when this is the sole domain. */
  bgClass: string
  /** Every household member subscribes; scope derives to 'compound'. */
  shared: boolean
}

export const DOMAINS: readonly DomainDef[] = [
  { id: 'work',     label: 'Work',     icon: Briefcase, color: 'rgb(37 99 235)',  bgClass: 'bg-blue-50/20',   shared: false },
  { id: 'family',   label: 'Family',   icon: Users,     color: 'rgb(217 119 6)',  bgClass: 'bg-amber-50/20',  shared: true },
  { id: 'personal', label: 'Personal', icon: User,      color: 'rgb(147 51 234)', bgClass: 'bg-purple-50/20', shared: false },
]

export const UNSORTED_ICON: LucideIcon = Inbox

export const ALL_LAYERS: ReadonlySet<Layer> = new Set<Layer>([...DOMAINS.map((d) => d.id), UNSORTED])

export const LAYER_LABELS: Record<Layer, string> = {
  work: 'Work',
  family: 'Family',
  personal: 'Personal',
  unsorted: 'Unsorted',
}

export function layerOf(context: TaskContext | null | undefined): Layer {
  return context ?? UNSORTED
}

export function domainById(id: DomainId): DomainDef {
  const def = DOMAINS.find((d) => d.id === id)
  if (!def) throw new Error(`unknown domain ${id}`)
  return def
}
