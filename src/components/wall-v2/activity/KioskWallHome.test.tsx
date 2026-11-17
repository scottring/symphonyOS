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

describe('the wall, today first: the day', () => {
  it('leads with getting out the door, then today’s rows; no kids’ checklists', () => {
    const p = props('out-the-door', { now: new Date(2026, 10, 10, 7, 0), onOpenDay: vi.fn() })
    render(<KioskWallHome {...p} />)
    expect(screen.getByRole('button', { name: /Out the door at 7:20/ })).toBeInTheDocument()
    const today = screen.getByRole('region', { name: 'Today' })
    expect([...today.querySelectorAll('.kh-row-t')].map((n) => n.textContent)).toEqual(['Boxing', 'Marta', 'Ukulele Club'])
    expect(screen.queryByText('Get dressed')).toBeNull()
    fireEvent.click(within(today).getByRole('button', { name: /Boxing/ }))
    expect(p.onTapRow).toHaveBeenCalledWith('box')
  })

  it('specials and the bag are chips that open the kid', () => {
    const p = props('rest', { now: new Date(2026, 10, 10, 10, 0) })
    render(<KioskWallHome {...p} />)
    const chips = screen.getByRole('group', { name: 'All day' })
    expect(chips).toHaveTextContent('EllaLibraryLibrary book')
    fireEvent.click(within(chips).getByRole('button', { name: /Kaleb/ }))
    expect(p.onOpenKid).toHaveBeenCalledWith(kaleb)
  })

  it('the banner is the next thing on the clock, and opens it', () => {
    const rows = [row('box', 'Boxing', '9:00a', ['s']), { ...row('uke', 'Ukulele Club', '2:10p', ['e', 'k']), startsAt: new Date(2026, 10, 10, 14, 10).getTime() }]
    const p = props('rest', { now: new Date(2026, 10, 10, 12, 0), weekend: { rows: [{ ...rows[0], past: true }, rows[1]], anytime: [], tomorrow: [], tomorrowLabel: 'Wednesday' } })
    render(<KioskWallHome {...p} />)
    const lead = screen.getByRole('button', { name: /Ukulele Club at 2:10/ })
    expect(lead).toHaveTextContent('Next · in 2 hours 10 min')
    fireEvent.click(lead)
    expect(p.onTapRow).toHaveBeenCalledWith('uke')
  })

  it('beside the day: dinner, then what waits — what others wait on us for first; each opens', () => {
    const onOpenDinner = vi.fn()
    const p = props('rest', { now: new Date(2026, 10, 10, 10, 0), onOpenDinner })
    render(<KioskWallHome {...p} />)
    const side = screen.getByRole('complementary', { name: 'Also today' })
    fireEvent.click(within(side).getByRole('button', { name: 'Dinner: Sheet-Pan Pesto Salmon' }))
    expect(onOpenDinner).toHaveBeenCalled()
    const waits = within(side).getByRole('region', { name: 'Waiting for' })
    expect([...waits.querySelectorAll('.kh-li-t')].map((n) => n.textContent)).toEqual(['FFG tuition', 'Winter trip dates'])
    fireEvent.click(within(waits).getByRole('button', { name: /FFG tuition/ }))
    expect(p.onOpenWork).toHaveBeenCalledWith('fee')
  })

  it('untimed things are chips that open the day', () => {
    const onOpenDay = vi.fn()
    render(<KioskWallHome {...props('rest', { now: new Date(2026, 10, 10, 10, 0), onOpenDay, weekend: { rows: [], anytime: [{ title: 'Kids’ laundry', owners: [] }], tomorrow: [], tomorrowLabel: 'Wednesday' } })} />)
    fireEvent.click(screen.getByRole('button', { name: /Kids’ laundry/ }))
    expect(onOpenDay).toHaveBeenCalled()
  })

  it('a day with nothing on the clock says so, and lets the room be empty', () => {
    render(<KioskWallHome {...props('weekend', { kids: [], weekend: { rows: [], anytime: [], tomorrow: [], tomorrowLabel: 'Sunday' }, dinner: null, board: { waits: { theirs: [], ours: [] }, news: null } })} />)
    expect(screen.getByRole('region', { name: 'Today' })).toHaveTextContent('Nothing on the clock today.')
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('shows what fits and counts the rest: nothing scrolls', () => {
    // A list box 200px tall and rows 56px each: three fit.
    const proto = HTMLElement.prototype
    const saved = (['clientHeight', 'offsetTop', 'offsetHeight'] as const).map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const)
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('kh-day') ? 200 : 0 } })
    Object.defineProperty(proto, 'offsetTop', { configurable: true, get(this: HTMLElement) { return this.parentElement ? [...this.parentElement.children].indexOf(this) * 56 : 0 } })
    Object.defineProperty(proto, 'offsetHeight', { configurable: true, get() { return 56 } })
    try {
      const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => row(id, `Thing ${id}`, `${i + 9}:00a`))
      render(<KioskWallHome {...props('rest', { kids: [], onOpenDay: vi.fn(), weekend: { rows, anytime: [], tomorrow: [], tomorrowLabel: 'Wednesday' } })} />)
      const today = screen.getByRole('region', { name: 'Today' })
      expect([...today.querySelectorAll('.kh-day > li')].filter((li) => !(li as HTMLElement).hidden)).toHaveLength(3)
      expect(within(today).getByRole('button', { name: '5 more today: open the day' })).toBeInTheDocument()
    } finally {
      for (const [k, d] of saved) { if (d) Object.defineProperty(proto, k, d); else delete (proto as unknown as Record<string, unknown>)[k] }
    }
  })

  it('early in the morning, before the routine starts, the wall is today — not the day after', () => {
    render(<KioskWallHome {...props('night', { now: new Date(2026, 10, 10, 6, 30) })} />)
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tomorrow' })).toBeNull()
  })
})

describe('the wall, today first: dinner and night', () => {
  it('at dinner time, dinner leads with Step by step and Recipe; today stays, tomorrow is one small card', () => {
    const p = props('dinner', { now: new Date(2026, 10, 10, 17, 35) })
    render(<KioskWallHome {...p} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sheet-Pan Pesto Salmon' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Step by step' }))
    expect(p.onStartCooking).toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tomorrow' })).toHaveTextContent('Tomorrow · Wednesday')
  })

  it('after dinner, before bedtime ends, it is still today', () => {
    render(<KioskWallHome {...props('bedtime', { now: new Date(2026, 10, 10, 19, 40) })} />)
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument()
  })

  it('after bedtime, tomorrow leads: a free day says so, with what goes in the bag', () => {
    render(<KioskWallHome {...props('night', { now: new Date(2026, 10, 10, 21, 20) })} />)
    expect(screen.getByRole('region', { name: 'Wednesday' })).toHaveTextContent('Wednesday is free.Ella Music · Kaleb Library · In the bag: Kaleb: Library book')
    expect(screen.getByRole('region', { name: 'Tomorrow' })).toHaveTextContent('Nothing on the clock on Wednesday.')
  })

  it('More takes the side; the day stays, dimmed', () => {
    const { container } = render(<KioskWallHome {...props('rest', { aside: <section aria-label="More">tiles</section> })} />)
    expect(screen.getByRole('region', { name: 'More' })).toBeInTheDocument()
    expect(container.querySelector('.kh-main')).toHaveClass('is-dim')
  })
})
