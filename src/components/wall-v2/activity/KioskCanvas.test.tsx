import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { Sun } from 'lucide-react'

// No network: Supabase, the recipe read, the phone book and placeCall are all
// stubbed. Nothing in this file can write a row or ring a phone.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))
const recipe = vi.hoisted(() => ({
  id: 'r1', title: 'Turkey chili', imageUrl: undefined,
  ingredients: ['2 lb ground turkey', '1 tbsp olive oil', '1 onion, diced', '2 cans kidney beans'],
  instructions: ['Heat the **oil** and soften the onion.', 'Brown the turkey.', 'Add the beans and simmer 20 minutes.'],
}))
vi.mock('@/hooks/useRecipe', () => ({
  useRecipe: (id: string | null) => ({ recipe: id ? recipe : null, loading: false, error: null }),
}))
vi.mock('@/hooks/useKidPhoneContacts', () => ({
  useKidPhoneContacts: () => ({ contacts: [], favorites: [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }], others: [], loading: false, error: undefined }),
  callableContacts: (cs: { enabled?: boolean }[]) => cs.filter((c) => c.enabled !== false),
}))
vi.mock('@/hooks/useHandsetState', () => ({ useHandsetState: () => ({ offHook: false }) }))
const placeCall = vi.fn()
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }))

import { KioskCanvas, type KioskCanvasProps } from './KioskCanvas'
import { useKioskActivity } from './useKioskActivity'
import type { KioskDinner } from './KioskStages'
import type { FamilyMember } from '@/types/family'
import type { GroceryLine, GroceryLineResult } from '@/lib/wall/activity/groceryProposal'
import { buildBedtimeGrid } from '@/lib/wall/activity/kioskRoutines'

const NOW = new Date(2026, 9, 10, 17, 30)
const members = [{ id: 'sk', name: 'Scott', initials: 'SK' }, { id: 'el', name: 'Ella', initials: 'EL' }] as unknown as FamilyMember[]
const dinner: KioskDinner = {
  key: 'r1', title: 'Turkey chili', imageUrl: null, timeLabel: 'Dinner at 6:30 PM', minutes: 40, cue: null,
  ingredients: recipe.ingredients, source: { recipeId: 'r1' }, hasRecipe: true, baseServes: 4,
}

function Harness(props: Partial<KioskCanvasProps> & { save?: KioskCanvasProps['saveGroceries'] }) {
  const activity = useKioskActivity('2026-10-10')
  return (
    <KioskCanvas
      isDark={false} activity={activity} now={NOW} moment="dinner" dateLabel="Sat, Oct 10" clock="5:30 PM"
      weather={{ icon: Sun, temp: 61, condition: 'Clear' }} tools={<button type="button">kidsPhone</button>}
      members={members}
      rows={[{ id: 'event-1', kind: 'event', time: '7p', end: null, title: 'Soccer pickup', sub: null, owners: ['el'], past: false, now: false, startsAt: new Date(2026, 9, 10, 19).getTime() }]}
      homeRows={[]} kidsNow={[]} focusRows={[]} handoffs={[]} checklists={[{ member: members[1], list: null }]}
      bedtime={buildBedtimeGrid([])} dinner={dinner} nextMeal={null} comingUp={[]}
      scratchpad={{ rows: [], onOpen: vi.fn() }} question={null}
      groceryListTitle="Groceries" saveGroceries={props.save ?? (async (lines: GroceryLine[]) => lines.map((l) => ({ key: l.key, ok: true })))}
      personPage={null} recipePage={<div>Whole recipe here</div>} recipeTitle="Turkey chili"
      onOpenRecipe={vi.fn()} onTapRow={vi.fn()} onTick={vi.fn()} onClaim={vi.fn()} onTapQuestion={vi.fn()} flash={vi.fn()}
      {...props}
    />
  )
}

const place = () => screen.getByRole('heading', { level: 1 }).textContent
const bar = () => within(screen.getByRole('navigation', { name: 'Kiosk' }))

describe('KioskCanvas frame', () => {
  beforeEach(() => { localStorage.clear(); placeCall.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps a stable frame: clock, place, Household, Home/Back, Tell Symphony (voice off), NEXT', () => {
    render(<Harness />)
    expect(place()).toBe('Home · Evening')
    expect(screen.getByText('Household')).toBeInTheDocument()
    expect(screen.getByText('5:30 PM')).toBeInTheDocument()
    expect(bar().getByRole('button', { name: /Home/ })).toBeInTheDocument()
    expect(bar().getByRole('button', { name: /Back/ })).toBeDisabled()
    expect(bar().getByRole('button', { name: /Tell Symphony — Voice off/ })).toBeInTheDocument()
    expect(bar().getByText('7p Soccer pickup · Ella')).toBeInTheDocument()
  })

  it('dinner → serves 6 scales with "was" marks → cooking → interruption → exact return', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Servings & ingredients' }))
    expect(place()).toBe('Dinner · Turkey chili')
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(screen.getByText('3 lb ground turkey')).toBeInTheDocument()
    expect(screen.getAllByText(/was 2/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    expect(place()).toBe('Cooking · Turkey chili for 6 · step 1 of 3')
    expect(screen.getByText('Heat the oil and soften the onion.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }))
    expect(place()).toBe('Cooking · Turkey chili for 6 · step 2 of 3')
    fireEvent.click(screen.getByRole('button', { name: '5 min' }))
    expect(screen.getByRole('list', { name: 'Timers' })).toHaveTextContent('5:00')

    // A question takes the stage: groceries mid-cooking. Cooking is held.
    fireEvent.click(screen.getByRole('button', { name: /Out of something/ }))
    expect(place()).toBe('Groceries · out of something')
    const held = screen.getByRole('complementary', { name: 'Cooking, held' })
    expect(held).toHaveTextContent('Step 2 of 3')
    expect(held).toHaveTextContent('Brown the turkey.')
    expect(bar().getByRole('button', { name: /Cooking · step 2 · 5:00/ })).toBeInTheDocument()

    fireEvent.click(bar().getByRole('button', { name: /Cooking · step 2/ }))
    expect(place()).toBe('Cooking · Turkey chili for 6 · step 2 of 3')
    expect(screen.getByRole('list', { name: 'Timers' })).toBeInTheDocument()
  })

  it('a reload restores cooking at the same step with the timer counting from its end time', () => {
    const { unmount } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }))
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }))
    fireEvent.click(screen.getByRole('button', { name: '20 min' }))
    unmount()
    render(<Harness />)
    expect(place()).toBe('Cooking · Turkey chili for 4 · step 3 of 3')
    expect(screen.getByRole('list', { name: 'Timers' })).toHaveTextContent(/20:00|19:5\d/)
  })

  it('groceries: only failed lines retry, with per-line states', async () => {
    const calls: string[][] = []
    let fail = new Set(['1 onion, diced'])
    const save = vi.fn(async (lines: GroceryLine[]): Promise<GroceryLineResult[]> => {
      calls.push(lines.map((l) => l.text))
      const r = lines.map((l) => ({ key: l.key, ok: !fail.has(l.text) }))
      fail = new Set()
      return r
    })
    render(<Harness save={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'Servings & ingredients' }))
    fireEvent.click(screen.getByRole('button', { name: /olive oil/ })) // we have oil
    fireEvent.click(screen.getByRole('button', { name: /Add what’s missing · 3/ }))
    expect(place()).toBe('Groceries')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 3 to Groceries' })) })
    expect(calls[0]).toEqual(['2 lb ground turkey', '1 onion, diced', '2 cans kidney beans'])
    expect(screen.getByRole('button', { name: /1 onion, diced.*Didn’t save/ })).toBeInTheDocument()
    expect(screen.getAllByText('Added')).toHaveLength(2)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Retry 1/ })) })
    expect(calls[1]).toEqual(['1 onion, diced'])
    expect(screen.getAllByText('Added')).toHaveLength(3)
  })

  it('Tell Symphony runs the same commands as the buttons', () => {
    render(<Harness />)
    fireEvent.click(bar().getByRole('button', { name: /Tell Symphony/ }))
    const panel = screen.getByRole('dialog', { name: 'Tell Symphony' })
    expect(within(panel).getByRole('switch', { name: /Voice commands: Off/ })).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText('Type a command'), { target: { value: 'we have six people' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Do it' }))
    expect(place()).toBe('Dinner · Turkey chili')
    expect(screen.getByText('6')).toBeInTheDocument()
    fireEvent.click(bar().getByRole('button', { name: /Tell Symphony/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Tell Symphony' })).getByRole('button', { name: 'Start cooking' }))
    expect(place()).toBe('Cooking · Turkey chili for 6 · step 1 of 3')
    fireEvent.click(bar().getByRole('button', { name: /Tell Symphony/ }))
    fireEvent.change(screen.getByLabelText('Type a command'), { target: { value: 'timer 5 minutes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }))
    expect(screen.getByRole('list', { name: 'Timers' })).toHaveTextContent('5:00')
  })

  it('cooking never times out; an idle dinner screen returns home with the held chip intact', () => {
    vi.useFakeTimers({ now: NOW })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    act(() => { vi.advanceTimersByTime(30 * 60_000) })
    expect(place()).toMatch(/^Cooking/)
    fireEvent.click(bar().getByRole('button', { name: /Home/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Servings & ingredients' }))
    expect(place()).toBe('Dinner · Turkey chili')
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(place()).toBe('Home · Evening')
    expect(bar().getByRole('button', { name: /Cooking · step 1/ })).toBeInTheDocument()
  })

  it('calling sits inside the frame and never dials without a confirm', () => {
    function WithCall() {
      const activity = useKioskActivity('2026-10-10')
      return (
        <>
          <button type="button" onClick={() => activity.dispatch({ type: 'OPEN', stage: { kind: 'calling' } })}>open phone</button>
          <Harness activity={activity} />
        </>
      )
    }
    render(<WithCall />)
    fireEvent.click(screen.getByRole('button', { name: 'open phone' }))
    expect(place()).toBe('Calling')
    fireEvent.click(screen.getByRole('button', { name: 'Call Grandma' }))
    expect(placeCall).not.toHaveBeenCalled()
    expect(screen.getByText(/Rings the kidsPhone handset/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(bar().getByRole('button', { name: /Back/ }))
    expect(place()).toBe('Home · Evening')
    expect(placeCall).not.toHaveBeenCalled()
  })
})
