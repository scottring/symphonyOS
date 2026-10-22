// Dev only (registered in main.tsx under import.meta.env.DEV): the comparison
// page with the mockup's data and in-memory writers, for visual review without
// the database. Never imported by production code paths.
import { useRef, useState } from 'react'
import { ChoicePageView, type ChoicePageWriters } from '@/components/choices/ChoicePage'
import type { ChoiceDetail } from '@/lib/choices/db'
import type { ChoiceOption, PriceLine, OptionStatus } from '@/types/choice'

const at = (iso: string) => new Date(iso)
const NOW = at('2026-10-22T12:00:00Z')

const option = (
  id: string, name: string, status: OptionStatus, sortOrder: number,
  values: ChoiceOption['values'], extra: Partial<ChoiceOption> = {},
): ChoiceOption => ({
  id, choiceId: 'fx-choice', userId: 'fx-user', name, status,
  statusChangedAt: NOW, values, sortOrder, updatedAt: NOW, ...extra,
})

const line = (id: string, optionId: string, workIds: string[], dollars: number, sortOrder: number): PriceLine =>
  ({ id, optionId, workIds, amountCents: dollars * 100, sortOrder })

export const fixtureDetail = (selectedWork: string[]): ChoiceDetail => ({
  choice: {
    id: 'fx-choice', userId: 'fx-user', goal: { kind: 'goal', id: 'fx-goal' },
    title: 'Bathroom contractor', status: 'open', decidedWork: [],
    columns: [
      { id: 'start', label: 'Earliest start', kind: 'date' },
      { id: 'insured', label: 'Insured', kind: 'yesno' },
      { id: 'refs', label: 'References', kind: 'text' },
    ],
    work: [
      { id: 'main', label: 'Main bath', description: 'Full gut: tile, vanity, shower' },
      { id: 'hall', label: 'Hall bath', description: 'Tub surround and floor' },
      { id: 'kids', label: "Kids' bath", description: 'Fixtures and paint' },
    ],
    selectedWork, sortOrder: 0, createdAt: NOW, updatedAt: NOW,
  },
  goalTitle: 'Renovate the bathrooms',
  goalContext: null,
  goalScope: 'family',
  options: [
    option('o1', 'Martinez Tile & Bath', 'heard_back', 0, { start: '2026-11-17', insured: true, refs: 'Called two, both happy' }),
    option('o2', 'Harbor Bath Remodeling', 'heard_back', 1, { start: '2027-01-05', insured: true }),
    option('o3', 'Chesapeake Renovations', 'heard_back', 2, { start: '2026-12-01', insured: true }),
    option('o4', "Rob (Dave's cousin)", 'contacted', 3, { refs: 'Did Dave\'s kitchen' }, { statusChangedAt: at('2026-10-16T12:00:00Z') }),
    option('o5', 'BathFitter', 'ruled_out', 4, {}),
  ],
  lines: [
    line('l1', 'o1', ['main'], 18400, 0), line('l2', 'o1', ['hall'], 9800, 1), line('l3', 'o1', ['kids'], 7200, 2),
    line('l4', 'o2', ['main'], 22900, 0), line('l5', 'o2', ['main', 'hall', 'kids'], 44500, 1),
    line('l6', 'o3', ['main'], 19750, 0), line('l7', 'o3', ['main', 'hall'], 27000, 1),
  ],
  followUps: [
    { taskId: 't1', optionId: 'o4', title: 'Follow up with Rob', scheduledFor: at('2026-10-24T12:00:00Z'), completed: false },
  ],
  contacts: new Map(),
})

export default function ChoiceFixture() {
  const params = new URLSearchParams(window.location.search)
  const [selected, setSelected] = useState((params.get('selected') ?? 'main,hall').split(','))
  const ok = async () => true
  const current = useRef(selected)
  const writers: ChoicePageWriters = {
    readChoice: async () => {
      const { choice } = fixtureDetail(current.current)
      return { columns: choice.columns, work: choice.work, selectedWork: current.current }
    },
    readOptionValues: async (id) => fixtureDetail(current.current).options.find((o) => o.id === id)?.values ?? null,
    setSelectedWork: async (ids) => { current.current = ids; setSelected(ids); return true },
    updateChoice: ok,
    deleteChoice: ok,
    addOption: async () => null,
    updateOption: ok,
    deleteOption: ok,
    addPriceLine: async () => null,
    updatePriceLine: ok,
    deletePriceLine: ok,
    createFollowUp: async () => 'fx-task',
    deleteTask: ok,
    chooseOption: ok,
    reopenChoice: ok,
    addContact: async () => ({ id: 'fx-contact' }),
    deleteContact: ok,
  }
  const detail = fixtureDetail(selected)
  // ?empty shows a new choice with no options yet.
  const shown = params.has('empty') ? { ...detail, options: [], lines: [], followUps: [] } : detail
  return <ChoicePageView detail={shown} writers={writers} />
}
