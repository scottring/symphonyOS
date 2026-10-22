// Dev only (registered in main.tsx under import.meta.env.DEV): the comparison
// page with the mockup's data and in-memory writers, for visual review without
// the database. Never imported by production code paths.
import { useRef, useState } from 'react'
import { ChoicePageView, type ChoicePageWriters, type PageLog } from '@/components/choices/ChoicePage'
import type { ChoiceDetail } from '@/lib/choices/db'
import { mergeLog } from '@/lib/choices/log'
import type { ChoiceOption, PriceLine, OptionStatus } from '@/types/choice'
import { LOG_KIND_LABEL, type LogEntry, type PlannedEvent } from '@/types/goalLog'

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

const GOAL = { kind: 'goal', id: 'fx-goal' } as const
const fixtureEntries: LogEntry[] = [
  { id: 'fx-e1', userId: 'fx-user', goal: GOAL, optionId: 'o1', kind: 'call', on: '2026-10-19', summary: 'Quote came; can start Nov 17', createdAt: at('2026-10-19T15:00:00Z') },
  { id: 'fx-e2', userId: 'fx-iris', goal: GOAL, kind: 'note', on: '2026-10-20', summary: 'Iris wants to keep the clawfoot tub', createdAt: at('2026-10-20T15:00:00Z') },
]
const fixturePlanned: PlannedEvent[] = [
  { taskId: 'fx-t2', optionId: 'o4', kind: 'visit', title: "Home visit: Walk through upstairs bath (Rob (Dave's cousin))", scheduledFor: new Date(2026, 9, 30, 10, 0), allDay: false, completed: false },
]
const fixtureMembers: Record<string, string> = { 'fx-user': 'Scott', 'fx-iris': 'Iris' }

export default function ChoiceFixture() {
  const params = new URLSearchParams(window.location.search)
  const [selected, setSelected] = useState((params.get('selected') ?? 'main,hall').split(','))
  const ok = async () => true
  const current = useRef(selected)
  // The log in memory: saves show up at once, as the real page's refetch would.
  const [entries, setEntries] = useState(fixtureEntries)
  const [planned, setPlanned] = useState(fixturePlanned)
  const goalLog: PageLog = { log: mergeLog(entries, planned), entries, memberName: (id) => fixtureMembers[id] }
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
    deleteTask: async (id) => { setPlanned((xs) => xs.filter((p) => p.taskId !== id)); return true },
    chooseOption: ok,
    reopenChoice: ok,
    addContact: async () => ({ id: 'fx-contact' }),
    deleteContact: ok,
    addLogEntry: async (input) => {
      const e: LogEntry = { id: crypto.randomUUID(), userId: 'fx-user', createdAt: new Date(), ...input }
      setEntries((xs) => [...xs, e])
      return e
    },
    updateLogEntry: async (id, patch) => {
      setEntries((xs) => xs.map((e) => (e.id === id
        ? { ...e, ...patch, time: patch.time === undefined ? e.time : (patch.time ?? undefined) }
        : e)))
      return true
    },
    deleteLogEntry: async (id) => { setEntries((xs) => xs.filter((e) => e.id !== id)); return true },
    planEvent: async (input) => {
      const taskId = crypto.randomUUID()
      const [y, m, d] = input.on.split('-').map(Number)
      const [hh, mm] = input.time ? input.time.split(':').map(Number) : [0, 0]
      setPlanned((xs) => [...xs, {
        taskId, optionId: input.optionId, kind: input.kind, allDay: !input.time, completed: false,
        title: `${LOG_KIND_LABEL[input.kind]}: ${input.summary}${input.optionName ? ` (${input.optionName})` : ''}`,
        scheduledFor: new Date(y, m - 1, d, hh, mm),
      }])
      return taskId
    },
  }
  const detail = fixtureDetail(selected)
  // ?empty shows a new choice with no options yet.
  const shown = params.has('empty') ? { ...detail, options: [], lines: [], followUps: [] } : detail
  return <ChoicePageView detail={shown} writers={writers} goalLog={params.has('empty') ? undefined : goalLog} />
}
