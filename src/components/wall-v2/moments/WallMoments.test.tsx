import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ConnectedWall } from './ConnectedWall'
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
  kidsNow: [{ member: kids[0], special: 'Library', hint: 'Return her library book.', needed: [], homeworkDue: [], afterSchool: [] }, { member: kids[1], special: 'Art', hint: null, needed: [], homeworkDue: [], afterSchool: [] }],
  focusRows: [], handoffs: [], dinner: null, nextMeal: { label: 'Dinner at 6:30 PM', title: 'Maple-Dijon salmon', imageUrl: null },
  scratchpad: { rows: [], onOpen: vi.fn() },
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
    // Only the reminder: the special itself is in Today and Specials, and a
    // special with nothing to do ("Art") says nothing here (2026-10-07).
    const now = within(screen.getByRole('region', { name: 'Now' }))
    expect(now.getByText('Return her library book.')).toBeInTheDocument()
    expect(now.queryByText(/Library today|Art today/)).toBeNull()
    expect(now.queryByText('Kaleb')).toBeNull()
    expect(screen.getByText('If our family had a flag, what would be on it?')).toBeInTheDocument()
    // The Specials box gave its place to the scratchpad (2026-10-07).
    expect(screen.queryByRole('region', { name: 'Specials this week' })).toBeNull()
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

  it('evening: tomorrow’s heads-up, with tomorrow’s special on the kid’s card', () => {
    render(<WallMoments {...base({
      moment: 'evening',
      specials: [
        { key: '2026-10-6', day: 'Tue', isToday: true, isTomorrow: false, cells: [{ memberId: 'el', text: 'Library' }, { memberId: 'ka', text: 'Art' }] },
        { key: '2026-10-7', day: 'Wed', isToday: false, isTomorrow: true, cells: [{ memberId: 'el', text: 'Music' }, { memberId: 'ka', text: 'Library' }] },
      ],
      kidsNow: [{ member: kids[1], special: 'Library', hint: null, needed: ['library books'], homeworkDue: [], afterSchool: [] }],
      nextMeal: { label: 'Dinner tomorrow', title: 'Sweet potato tacos', imageUrl: null },
    })} />)
    expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()
    expect(screen.getByText('Bring: library books')).toBeInTheDocument()
    // The Specials box is gone, so tomorrow's special is said here.
    expect(within(screen.getByRole('region', { name: 'Now' })).getByText('Library tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Sweet potato tacos')).toBeInTheDocument()
  })

  // Scott, 2026-10-05: "the kiosk meal no longer taps to the recipe".
  it('tapping the meal line opens its recipe', () => {
    const onOpen = vi.fn()
    render(<WallMoments {...base({ moment: 'after', nextMeal: { label: 'Dinner at 6:30 PM', title: 'Maple-Dijon salmon', imageUrl: null, onOpen } })} />)
    fireEvent.click(screen.getByRole('button', { name: /Maple-Dijon salmon\. Open the recipe/ }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('at dinner, tapping the photo opens the recipe too', () => {
    const onCook = vi.fn()
    render(<WallMoments {...base({
      moment: 'dinner',
      dinner: { title: 'Salmon', imageUrl: null, minutes: null, cue: null, ingredients: [], hasRecipe: true, scale: 1, onScale: vi.fn(), onCook, have: new Set(), onToggleHave: vi.fn(), onAddMissing: vi.fn() },
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Salmon: open the recipe' }))
    expect(onCook).toHaveBeenCalled()
  })

  // Scott, 2026-10-07: "the day's homework and math/reading practice … in the
  // afternoon", once each, by child, ticked off where it stands.
  it('after school: each kid’s homework and practice, ticked off in place — and not Today’s rows again', () => {
    const onTick = vi.fn()
    const math = { entityType: 'routine' as const, id: 'm1', title: 'Math practice', done: false, timeOfDay: '16:30', target: null }
    render(<WallMoments {...base({
      moment: 'after', onTick,
      focusRows: [],
      kidsNow: [
        { member: kids[0], special: null, hint: null, needed: [], homeworkDue: [], afterSchool: [{ entityType: 'task', id: 'h1', title: 'Reading log · due tomorrow', done: false, timeOfDay: null, target: null }] },
        { member: kids[1], special: null, hint: null, needed: [], homeworkDue: [], afterSchool: [math] },
      ],
    })} />)
    const now = within(screen.getByRole('region', { name: 'Now' }))
    expect(now.getByRole('heading', { name: 'After school' })).toBeInTheDocument()
    expect(now.getByText('Reading log · due tomorrow')).toBeInTheDocument()
    expect(now.queryByText('School')).toBeNull()
    fireEvent.click(now.getByRole('button', { name: 'Math practice' }))
    expect(onTick).toHaveBeenCalledWith(kids[1], math)
  })

  it('after school with nothing to do says so', () => {
    render(<WallMoments {...base({ moment: 'after' })} />)
    expect(screen.getByText('No homework or practice today.')).toBeInTheDocument()
  })

  // Scott, 2026-10-07: a scratchpad where the Specials box was.
  it('the scratchpad shows the newest notes and opens the sheet, at a note or at the input', () => {
    const onOpen = vi.fn()
    const rows = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: `note:${k}`, text: `Note ${k}`, sub: 'Note', icon: 'note' as const, authorId: null }))
    rows[0] = { ...rows[0], icon: 'talk' as const, authorId: 'sk', sub: 'Talk about · Scott' }
    render(<WallMoments {...base({ scratchpad: { rows, onOpen } })} />)
    const pad = within(screen.getByRole('region', { name: 'Scratchpad' }))
    expect(pad.getByText('5 open')).toBeInTheDocument()
    expect(pad.getByText('Note a')).toBeInTheDocument()
    expect(pad.queryByText('Note d')).toBeNull()
    fireEvent.click(pad.getByRole('button', { name: /Note b/ }))
    expect(onOpen).toHaveBeenLastCalledWith('note:b')
    fireEvent.click(pad.getByRole('button', { name: /Jot a note/ }))
    expect(onOpen).toHaveBeenLastCalledWith(null)
    fireEvent.click(pad.getByRole('button', { name: '+ 2 more' }))
    expect(onOpen).toHaveBeenLastCalledWith(null)
  })
})


describe('ConnectedWall preserves real wall actions', () => {
  it('opens notes, returns home, and retains routine callbacks', () => {
    const props = base()
    render(<ConnectedWall {...props} />)
    fireEvent.click(screen.getByRole('button', {name:'Notes & coming up'}))
    expect(screen.getByRole('heading', {name:'Notes & coming up'})).toHaveFocus()
    fireEvent.click(screen.getByRole('button', {name:'Add a note'}))
    expect(props.scratchpad.onOpen).toHaveBeenCalledWith(null)
    expect(screen.getByText(/Grandpappa picks up/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name:'Back to Today'}))
    fireEvent.click(screen.getByRole('button', {name:/Shoes/}))
    expect(props.onOpenKid).toHaveBeenCalledWith(kids[0])
  })
  it('keeps dinner preparation actions behind the compact dinner card', () => {
    const onScale=vi.fn(), onCook=vi.fn(), onToggleHave=vi.fn(), onAddMissing=vi.fn()
    const props=base({moment:'dinner',dinner:{title:'Pasta',imageUrl:null,minutes:20,cue:null,ingredients:['Lemon'],hasRecipe:true,scale:1,onScale,onCook,have:new Set(),onToggleHave,onAddMissing}})
    render(<ConnectedWall {...props}/>)
    fireEvent.click(screen.getByRole('button',{name:'Ingredients & portions'}))
    fireEvent.click(screen.getByRole('button',{name:'Lemon'}))
    fireEvent.click(screen.getByRole('button',{name:'×2'}))
    fireEvent.click(screen.getByRole('button',{name:/Add missing to shopping/}))
    fireEvent.click(screen.getByRole('button',{name:'Cook from the recipe'}))
    expect(onToggleHave).toHaveBeenCalledWith(0)
    expect(onScale).toHaveBeenCalledWith(2)
    expect(onAddMissing).toHaveBeenCalledOnce()
    expect(onCook).toHaveBeenCalledOnce()
  })

  it('makes schedule overflow reachable and clamps the page after data shrinks', () => {
    const props = base()
    const today = Array.from({length:6},(_,i)=>({...props.today[0],id:`item-${i}`,title:`Item ${i}`}))
    const {rerender} = render(<ConnectedWall {...props} today={today} />)
    expect(screen.queryByText('Item 4')).toBeNull()
    fireEvent.click(screen.getByRole('button', {name:'Later'}))
    fireEvent.click(screen.getByRole('button', {name:/Item 4/}))
    expect(props.onTapRow).toHaveBeenCalledWith('item-4')
    rerender(<ConnectedWall {...props} today={today.slice(0,1)} />)
    expect(screen.getByText('Item 0')).toBeInTheDocument()
  })
})
