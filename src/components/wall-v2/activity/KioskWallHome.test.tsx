import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KioskWallHome } from './KioskWallHome'
import type { KioskHomeV1Props } from './KioskHomeV1'
import type { FamilyMember } from '@/types/family'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import type { KioskScreen } from '@/lib/wall/activity/kioskScreen'

const member = (id: string, name: string, color: string) => ({ id, name, initials: name[0], color }) as FamilyMember
const ella = member('e', 'Ella', '#0a7'), kaleb = member('k', 'Kaleb', '#f90'), scott = member('s', 'Scott', '#00f'), iris = member('i', 'Iris', '#808')
const row = (id: string, title: string, time: string, owners: string[] = [], past = false): WallTodayRow =>
  ({ id, kind: 'event', time, end: null, title, sub: null, owners, past, now: false })
const step = (id: string, title: string) => ({ entityType: 'routine' as const, id, title, done: false, timeOfDay: '06:45', target: null })

function props(screen_: KioskScreen, over: Partial<KioskHomeV1Props> = {}): KioskHomeV1Props {
  return {
    pick: { screen: screen_, title: '', dark: false },
    now: new Date(2026, 10, 10, 7, 46),
    anchors: { morning: { start: 405, end: 440 }, home: { start: 1035 }, dinner: 1080, bedtime: { start: 1170, end: 1230 } },
    members: [scott, iris, ella, kaleb],
    kids: [
      { member: ella, special: 'Library', tomorrowSpecial: 'Music', bag: ['Library book'], morning: [step('m1', 'Get dressed')], after: [], tomorrowBag: [] },
      { member: kaleb, special: 'Art', tomorrowSpecial: 'Library', bag: [], morning: [step('m2', 'Get dressed')], after: [], tomorrowBag: ['Library book'] },
    ],
    restLine: '', restSub: null, notes: [], talks: [],
    dinner: { key: 'r1', title: 'Sheet-Pan Pesto Salmon', imageUrl: null, timeLabel: 'Dinner at 6:00', minutes: null, cue: null, ingredients: [], source: null, hasRecipe: true } as never,
    have: [], scale: 1, question: null,
    bedtime: { title: 'Bedtime', people: [], steps: [], done: 0, total: 0, inProgress: false },
    tomorrow: { label: 'Wednesday', outTheDoor: null, specials: [] },
    weekend: { rows: [row('box', 'Boxing', '9:00a', ['s']), row('marta', 'Marta', '9:30a', ['s']), row('uke', 'Ukulele Club', '2:10p', ['e', 'k'])], anytime: [], tomorrow: [], tomorrowLabel: 'Wednesday' },
    onTick: vi.fn(), onOpenKid: vi.fn(), onToggleHave: vi.fn(), onScale: vi.fn(), onAddMissing: vi.fn(),
    onOpenRecipe: vi.fn(), onStartCooking: vi.fn(), onTapRow: vi.fn(), onOpenWork: vi.fn(), onNotes: vi.fn(),
    board: {
      waits: {
        theirs: [{ id: 'dates', title: 'Winter trip dates', from: { name: 'Iris', member: iris }, to: { name: 'Scott', member: scott }, when: '2 days', late: false }],
        ours: [{ id: 'fee', title: 'FFG tuition', from: { name: 'Iris', member: iris }, to: { name: 'FFG' }, when: 'Due today', late: false }],
      },
      news: null,
    },
    ...over,
  }
}

describe('the calm wall: the day', () => {
  it('leads with today’s appointments, large, and no kids’ checklists — even in the morning', () => {
    const p = props('out-the-door')
    render(<KioskWallHome {...p} />)
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getAllByRole('button').map((b) => b.querySelector('.kh-ev-w')?.textContent)).toEqual(['Boxing', 'Marta', 'Ukulele Club'])
    expect(screen.queryByText('Get dressed')).toBeNull()
    expect(today).toHaveTextContent('Ella Library · Kaleb Art')
    expect(today).toHaveTextContent('In the bag Ella: Library book')
    fireEvent.click(within(today).getByRole('button', { name: /Boxing/ }))
    expect(p.onTapRow).toHaveBeenCalledWith('box')
  })

  it('beside them: dinner, then what waits — what others wait on us for first', () => {
    const p = props('rest')
    render(<KioskWallHome {...p} />)
    const side = screen.getByRole('complementary', { name: 'Also today' })
    expect(within(side).getByText('Sheet-Pan Pesto Salmon')).toBeInTheDocument()
    const waits = within(side).getByRole('region', { name: 'Waiting for' })
    expect(within(waits).getAllByRole('button').map((b) => b.querySelector('.kh-line-t')?.textContent)).toEqual(['FFG tuition', 'Winter trip dates'])
    fireEvent.click(within(waits).getByRole('button', { name: /FFG tuition/ }))
    expect(p.onOpenWork).toHaveBeenCalledWith('fee')
  })

  it('a day with nothing on the clock says so, and lets the room be empty', () => {
    render(<KioskWallHome {...props('weekend', { weekend: { rows: [], anytime: [], tomorrow: [], tomorrowLabel: 'Sunday' }, dinner: null, board: { waits: { theirs: [], ours: [] }, news: null } })} />)
    expect(screen.getByRole('heading', { name: 'Nothing on the clock today.' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('shows four appointments and counts the rest: nothing scrolls', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => row(id, `Thing ${id}`, `${i + 9}:00a`))
    render(<KioskWallHome {...props('rest', { weekend: { rows, anytime: [], tomorrow: [], tomorrowLabel: 'Wednesday' } })} />)
    const today = screen.getByRole('region', { name: 'Today' })
    expect(today.querySelectorAll('.kh-ev')).toHaveLength(4)
    expect(today).toHaveTextContent('+2 more')
  })
})

describe('the calm wall: dinner and night', () => {
  it('at dinner time, dinner leads with Step by step and Recipe; tomorrow sits beside it', () => {
    const p = props('dinner', { now: new Date(2026, 10, 10, 17, 35) })
    render(<KioskWallHome {...p} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sheet-Pan Pesto Salmon' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Step by step' }))
    expect(p.onStartCooking).toHaveBeenCalled()
    const tomorrow = screen.getByRole('region', { name: 'Tomorrow' })
    expect(tomorrow).toHaveTextContent('Nothing on the clock')
    expect(tomorrow).toHaveTextContent('Ella Music · Kaleb Library')
  })

  it('after dinner, tomorrow: a free day says so, with what goes in the bag', () => {
    render(<KioskWallHome {...props('night', { now: new Date(2026, 10, 10, 21, 20) })} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Wednesday is free.' })).toBeInTheDocument()
    expect(screen.getByText(/Kaleb: Library book/)).toBeInTheDocument()
  })

  it('the evening after dinner is already tomorrow’s screen', () => {
    render(<KioskWallHome {...props('rest', { now: new Date(2026, 10, 10, 19, 10) })} />)
    expect(screen.getByRole('region', { name: 'Tomorrow' })).toBeInTheDocument()
  })

  it('More takes the side column; the day stays, dimmed', () => {
    render(<KioskWallHome {...props('rest', { aside: <section aria-label="More">tiles</section> })} />)
    expect(screen.getByRole('region', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Today' })).toHaveClass('is-dim')
  })
})
