// Person colours on the wall: one tint per family member, shared by the
// moments screen and the scratchpad sheet so a person reads the same everywhere.
import type { FamilyMember } from '@/types/family'

// Person tints: hue and lightness both differ, so the chips read apart.
const TINTS = ['bg-[#2b4a7a] text-[#d8e6ff]', 'bg-[#53347a] text-[#efdcff]', 'bg-[#7a2f4b] text-[#ffdbe7]', 'bg-[#24603f] text-[#d6f5e3]', 'bg-[#6b4a14] text-[#ffe9bf]', 'bg-[#1f5a63] text-[#d3f3f7]']
const BARS = ['#4f86d9', '#9c6bd9', '#d9668d', '#4fb37f', '#d9a24f', '#4fb3c2']

export function useTint(members: FamilyMember[]) {
  const idx = new Map(members.map((m, i) => [m.id, i % TINTS.length]))
  return {
    chip: (id: string) => TINTS[idx.get(id) ?? 0],
    bar: (ids: string[]) => (ids.length === 1 ? BARS[idx.get(ids[0]) ?? 0] : ids.length > 1 ? '#8a6bd1' : '#6c7c8f'),
    initial: (id: string) => {
      const m = members.find((x) => x.id === id)
      return (m?.initials || m?.name?.[0] || '?').slice(0, 2).toUpperCase()
    },
    name: (id: string) => members.find((x) => x.id === id)?.name ?? '',
  }
}

export type Tint = ReturnType<typeof useTint>

export function Chip({ id, t, size = 'md' }: { id: string; t: Tint; size?: 'sm' | 'md' }) {
  return (
    <span aria-label={t.name(id)} className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${size === 'sm' ? 'h-8 w-8 text-[0.8rem]' : 'h-10 w-10 text-[0.9rem]'} ${t.chip(id)}`}>
      {t.initial(id)}
    </span>
  )
}

