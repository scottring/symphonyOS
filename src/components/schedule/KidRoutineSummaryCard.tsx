import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FamilyMember } from '@/types/family'

interface KidRoutineSummaryCardProps {
  section: 'morning' | 'evening'
  familyMembers: FamilyMember[]
}

export function KidRoutineSummaryCard({ section, familyMembers }: KidRoutineSummaryCardProps) {
  const navigate = useNavigate()

  const kids = useMemo(
    () => familyMembers.filter(m => {
      const lower = m.name.toLowerCase()
      return lower.includes('ella') || lower.includes('kaleb')
    }),
    [familyMembers],
  )

  if (kids.length === 0) return null

  const isMorning = section === 'morning'
  const icon = isMorning ? '🌅' : '🌙'
  const title = isMorning ? 'Morning Launch' : 'Bedtime Routines'
  const target = isMorning ? '/morning' : '/bedtime'
  const accent = isMorning ? '#F9C35C' : '#A78BFA'
  const subtitle = `For ${kids.map(k => k.name).join(' & ')}`

  return (
    <button
      onClick={() => navigate(target)}
      className="w-full text-left card flex items-center gap-4 px-5 py-4 mb-3 hover:shadow-md transition-shadow group"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-[1.5rem] flex-shrink-0"
        style={{ backgroundColor: `${accent}20` }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-lg font-semibold leading-tight">{title}</div>
        <div className="text-sm text-neutral-500 mt-0.5">{subtitle}</div>
      </div>
      <div
        className="text-sm font-bold uppercase tracking-wider opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ color: accent }}
      >
        Open →
      </div>
    </button>
  )
}
