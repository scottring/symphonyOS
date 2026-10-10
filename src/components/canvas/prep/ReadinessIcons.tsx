// src/components/canvas/prep/ReadinessIcons.tsx
//
// Readiness at a glance on a row: up to three small line icons for what the
// item carries (contact, link, file, place, steps with a count). Muted and
// decorative to the eye; the label says it in words.

import { User, Link as LinkIcon, FileText, MapPin, ListChecks } from 'lucide-react'
import { describeReadiness, type OwnReadiness, type ReadinessKind } from '@/lib/prep/readiness'

const ROW_KINDS: ReadinessKind[] = ['contact', 'link', 'file', 'place', 'steps']
const ICONS = { contact: User, link: LinkIcon, file: FileText, place: MapPin, steps: ListChecks } as const

export function ReadinessIcons({ readiness, max = 3 }: { readiness: OwnReadiness; max?: number }) {
  const shown = ROW_KINDS.filter((k) => readiness.kinds.includes(k)).slice(0, max) as (keyof typeof ICONS)[]
  if (!shown.length) return null
  return <span className="prep-icons" role="img" aria-label={`Has ${describeReadiness(readiness).join(', ')}`}>
    {shown.map((k) => {
      const Icon = ICONS[k]
      return <span key={k} className="prep-icons-one"><Icon size={14} aria-hidden="true" />{k === 'steps' && <small>{readiness.steps.total}</small>}</span>
    })}
  </span>
}
