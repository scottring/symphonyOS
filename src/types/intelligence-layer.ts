// Intelligence Layer types

export interface IntelligenceLayer {
  id: string
  slug: string
  name: string
  color: string
  icon: string | null
  description: string | null
  status: 'active' | 'inactive' | 'setup'
  createdAt: string
}

export type LayerSlug = 'relish' | 'organization' | 'work' | 'wellness'

export const LAYER_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  relish: { label: 'Relish', color: 'text-amber-700', bgColor: 'bg-amber-100', borderColor: 'border-amber-200' },
  organization: { label: 'Organization', color: 'text-slate-700', bgColor: 'bg-slate-100', borderColor: 'border-slate-200' },
  work: { label: 'Work Focus', color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  wellness: { label: 'Wellness', color: 'text-green-700', bgColor: 'bg-green-100', borderColor: 'border-green-200' },
}
