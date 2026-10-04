import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Sun } from 'lucide-react'
import { WallMoments, type WallMomentsProps } from './WallMoments'
import type { FamilyMember } from '@/types/family'

const members = [
  { id: 'sk', name: 'Scott', initials: 'SK' },
  { id: 'el', name: 'Ella', initials: 'EL' },
  { id: 'ka', name: 'Kaleb', initials: 'KA' },
] as unknown as FamilyMember[]
const kids = members.slice(1)

const base = (o: Partial<WallMomentsProps> = {}): WallMomentsProps => ({
  moment: 'morning', dateLabel: 'Tue, Oct 6', clock: '7:10 AM', weather: { icon: Sun, temp: 58, condition: 'Sunny' },
  members, kids,
  today: [{ id: 'event-school', kind: 'event', time: '7:30a', end: '2:10p', title: 'School', sub: 'Hampden Elementary', owners: ['el', 'ka'], past: false, now: true }],
  specials: [{ key: '2026-10-6', day: 'Tue', isToday: true, isTomorrow: false, cells: [{ memberId: 'el', text: 'Library' }, { memberId: 'ka', text: 'Art' }] }],
  comingUp: [{ dateKey: '2026-10-9', dayLabel: 'Fri', summary: 'Grandpappa picks up Ella & Kaleb' }],
  kidsNow: [{ member: kids[0], special: 'Library', hint: 'library books', needed: [], homeworkDue: [] }, { member: kids[1], special: 'Art', hint: null, needed: [], homeworkDue: [] }],
  focusRows: [], handoffs: [], dinner: null, nextMeal: { label: 'Dinner at 6:30 PM', title: 'Maple-Dijon salmon', imageUrl: null },
  question: { text: 'If our family had a flag, what would be on it?', isHandoff: false },
  checklists: [{ member: kids[0], list: { title: 'Out the door', rows: [{ entityType: 'routine', id: 'r1', title: 'Shoes', done: false, timeOfDay: null, target: null }] } }],
  onTapRow: vi.fn(), onClaim: vi.fn(), onTapQuestion: vi.fn(), onTick: vi.fn(), onOpenKid: vi.fn(),
  ...o,
})

// Scott, 2026-10-04: "it's beautiful, ship it" — the wall by time of day.
describe('WallMoments', () => {
  it('a school morning: today, its specials, out the door, the question, the kids’ lists', () => {
    render(<WallMoments {...base()} />)
    expect(screen.getByRole('heading', { name: 'Good morning' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Ella · Library')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Now' })).getByRole('heading', { name: 'Out the door' })).toBeInTheDocument()
    expect(screen.getByText('Library today — library books')).toBeInTheDocument()
    expect(screen.getByText('If our family had a flag, what would be on it?')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Specials this week' })).getByText('Tue').closest('tr')).toHaveClass('bg-[#243245]')
  })

  it('a kid ticks a step on their list', () => {
    const onTick = vi.fn()
    render(<WallMoments {...base({ onTick })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Shoes' }))
    expect(onTick).toHaveBeenCalledWith(kids[0], expect.objectContaining({ id: 'r1' }))
  })

  it('after school: an unclaimed pickup asks who has it', () => {
    const onClaim = vi.fn()
    render(<WallMoments {...base({ moment: 'after', handoffs: [{ key: 'k', time: '3:10p', prompt: 'Who’s picking up Ella?' }], onClaim })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Who’s got it?' }))
    expect(onClaim).toHaveBeenCalled()
  })

  it('dinner: the meal, its cue, ×2 / ×3, and the missing ingredients to shopping', () => {
    const onScale = vi.fn(); const onAddMissing = vi.fn(); const onCook = vi.fn()
    render(<WallMoments {...base({
      moment: 'dinner',
      dinner: { title: 'Sheet-pan maple-Dijon salmon', imageUrl: null, minutes: 45, cue: 'Oven to 400°F now.', ingredients: ['1 1/4 lb salmon', '4 small sweet potatoes'], hasRecipe: true, scale: 1, onScale, onCook, have: new Set([0]), onToggleHave: vi.fn(), onAddMissing },
    })} />)
    expect(screen.getByText('Oven to 400°F now.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '×3' }))
    expect(onScale).toHaveBeenCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: /Add missing to shopping/ }))
    expect(onAddMissing).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Cook from the recipe/ }))
    expect(onCook).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '1 1/4 lb salmon' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('evening: tomorrow’s heads-up, tomorrow’s specials lit', () => {
    render(<WallMoments {...base({
      moment: 'evening',
      specials: [
        { key: '2026-10-6', day: 'Tue', isToday: true, isTomorrow: false, cells: [{ memberId: 'el', text: 'Library' }, { memberId: 'ka', text: 'Art' }] },
        { key: '2026-10-7', day: 'Wed', isToday: false, isTomorrow: true, cells: [{ memberId: 'el', text: 'Music' }, { memberId: 'ka', text: 'Library' }] },
      ],
      kidsNow: [{ member: kids[1], special: 'Library', hint: null, needed: ['library books'], homeworkDue: [] }],
      nextMeal: { label: 'Dinner tomorrow', title: 'Sweet potato tacos', imageUrl: null },
    })} />)
    expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()
    expect(screen.getByText('Bring: library books')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Specials this week' })).getByText('Wed').closest('tr')).toHaveClass('bg-[#243245]')
    expect(screen.getByText('Sweet potato tacos')).toBeInTheDocument()
  })
})
