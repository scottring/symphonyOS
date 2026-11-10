import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KioskHomeV1, type KioskHomeV1Props } from './KioskHomeV1'
import type { KioskBoardData } from './KioskBoard'
import { boardAssignments } from '@/lib/wall/activity/wallBoard'
import type { FamilyMember } from '@/types/family'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'

const member = (id: string, name: string, color: string) => ({ id, name, initials: name[0], color }) as FamilyMember
const ella = member('e', 'Ella', '#0a7'), kaleb = member('k', 'Kaleb', '#f90'), scott = member('s', 'Scott', '#00f'), iris = member('i', 'Iris', '#808')
const row = (id: string, title: string, time: string, kind: WallTodayRow['kind'] = 'event', owners: string[] = []): WallTodayRow =>
  ({ id, kind, time, end: null, title, sub: null, owners, past: false, now: false })
const homework = (id: string, title: string, note: string | null) => ({ row: { entityType: 'task' as const, id, title, done: false, timeOfDay: null, target: null }, note })

const board: KioskBoardData = {
  waits: {
    theirs: [{ id: 'dates', title: 'Winter trip dates', from: { name: 'Iris', member: iris }, to: { name: 'Scott', member: scott }, when: '2 days', late: false }],
    ours: [{ id: 'letter', title: 'Letter for Ms. Kroger', from: { name: 'Scott', member: scott }, to: { name: 'Ms. Kroger' }, when: 'Was due Thu', late: true }],
  },
  news: { label: 'Fri, Nov 6', items: [{ title: 'Holiday Festival & Craft Fair', sub: 'Thu Dec 10 – Fri Dec 11' }] },
}

function props(over: Partial<KioskHomeV1Props> = {}): KioskHomeV1Props {
  return {
    pick: { screen: 'rest', title: 'A quiet afternoon', dark: false },
    now: new Date(2026, 10, 10, 14, 15),
    anchors: { morning: { start: 405, end: 440 }, home: { start: 1035 }, dinner: 1080, bedtime: { start: 1170, end: 1230 } },
    members: [scott, iris, ella, kaleb],
    kids: [
      { member: ella, special: 'Visual Art', tomorrowSpecial: 'Library', bag: [], morning: [], after: [], work: { today: [homework('sq', 'Fluency homework: Giant Squid', 'late')], week: [{ id: 'u4', title: 'Study for Unit 4 math test', due: 'Thu' }] } },
      { member: kaleb, special: 'PE', tomorrowSpecial: null, bag: [], morning: [], after: [], work: { today: [homework('sq2', 'Fluency homework: Giant Squid', 'late')], week: [] } },
    ],
    restLine: 'Dinner at 6:00', restSub: null, notes: [], talks: [],
    dinner: { key: 'r1', title: 'Sheet-Pan Chicken Sausage', imageUrl: null, timeLabel: 'Dinner at 6:00', minutes: null, cue: null, ingredients: [], source: null, hasRecipe: true } as never,
    have: [], scale: 1, question: null,
    bedtime: { title: 'Bedtime', people: [], steps: [], done: 0, total: 0, inProgress: false },
    tomorrow: { label: 'Wednesday', outTheDoor: '7:20', specials: [] },
    weekend: { rows: [row('box', 'Boxing', '9:00a', 'event', ['s']), row('tsk', 'Call the plumber', '3:00p', 'task')], anytime: [], tomorrow: [row('uke', 'Ukulele Club', '2:10p', 'event', ['e', 'k'])], tomorrowLabel: 'Wednesday' },
    onTick: vi.fn(), onOpenKid: vi.fn(), onToggleHave: vi.fn(), onScale: vi.fn(), onAddMissing: vi.fn(),
    onOpenRecipe: vi.fn(), onStartCooking: vi.fn(), onTapRow: vi.fn(), onOpenWork: vi.fn(), onNotes: vi.fn(),
    board,
    ...over,
  }
}

describe('the kitchen wall board', () => {
  it('leads with dinner, its recipe and cooking it step by step', () => {
    const p = props()
    render(<KioskHomeV1 {...p} />)
    const dinner = screen.getByRole('region', { name: 'Dinner tonight' })
    expect(within(dinner).getByText('Sheet-Pan Chicken Sausage')).toBeInTheDocument()
    fireEvent.click(within(dinner).getByRole('button', { name: 'Recipe' }))
    fireEvent.click(within(dinner).getByRole('button', { name: 'Step by step' }))
    expect(p.onOpenRecipe).toHaveBeenCalled()
    expect(p.onStartCooking).toHaveBeenCalled()
  })

  it('puts appointments on the calendar, today’s and tomorrow’s, with the kids’ specials', () => {
    render(<KioskHomeV1 {...props()} />)
    const cal = screen.getByRole('region', { name: 'Calendar' })
    expect(within(cal).getByText('Ella Visual Art · Kaleb PE')).toBeInTheDocument()
    expect(within(cal).getByText('Boxing')).toBeInTheDocument()
    expect(within(cal).getByText('Ukulele Club')).toBeInTheDocument()
    expect(within(cal).getByText('Ella Library')).toBeInTheDocument()
    // A task is not an appointment.
    expect(within(cal).queryByText('Call the plumber')).toBeNull()
  })

  it('shows each wait from one person to the other, both ways, and opens it', () => {
    const p = props()
    render(<KioskHomeV1 {...p} />)
    const waiting = screen.getByRole('region', { name: 'Waiting for' })
    expect(within(waiting).getByText('We’re waiting for')).toBeInTheDocument()
    expect(within(waiting).getByText('Waiting on us')).toBeInTheDocument()
    const letter = within(waiting).getByRole('button', { name: /Letter for Ms\. Kroger/ })
    expect(letter).toHaveTextContent('Scott→Ms. KrogerWas due Thu')
    fireEvent.click(letter)
    expect(p.onOpenWork).toHaveBeenCalledWith('letter')
  })

  it('lists school work once however many kids have it, then the digest’s announcements', () => {
    render(<KioskHomeV1 {...props()} />)
    const school = screen.getByRole('region', { name: 'School' })
    expect(within(school).getAllByText('Fluency homework: Giant Squid')).toHaveLength(1)
    expect(within(school).getByText('Due Thu')).toBeInTheDocument()
    expect(within(school).getByText('Announcements · Fri, Nov 6')).toBeInTheDocument()
    expect(within(school).getByText('Holiday Festival & Craft Fair')).toBeInTheDocument()
  })

  it('says so when nothing waits either way', () => {
    render(<KioskHomeV1 {...props({ board: { waits: { theirs: [], ours: [] }, news: null } })} />)
    expect(screen.getByText('Nothing waiting either way.')).toBeInTheDocument()
  })

  it('gives way to the older quiet screen while More is open', () => {
    render(<KioskHomeV1 {...props({ aside: <div>More</div> })} />)
    expect(screen.queryByRole('region', { name: 'Waiting for' })).toBeNull()
  })
})

describe('boardAssignments', () => {
  it('drops work that is done', () => {
    const done = { row: { entityType: 'task' as const, id: 'x', title: 'Spelling', done: true, timeOfDay: null, target: null }, note: null }
    expect(boardAssignments([{ member: ella, special: null, tomorrowSpecial: null, bag: [], morning: [], after: [], work: { today: [done], week: [] } }])).toEqual([])
  })
})
