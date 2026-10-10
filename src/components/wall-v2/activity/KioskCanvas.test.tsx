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
  partitionContacts: (cs: { favorite: boolean }[]) => ({ favorites: cs.filter((c) => c.favorite), others: cs.filter((c) => !c.favorite) }),
}))
vi.mock('@/hooks/useHandsetState', () => ({ useHandsetState: () => ({ offHook: false }) }))
const placeCall = vi.fn()
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }))

import { KioskCanvas, type KioskCanvasProps, type KioskTools } from './KioskCanvas'
import { Plus, Moon } from 'lucide-react'
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
      weather={{ icon: Sun, temp: 61, condition: 'Clear' }} tools={tools}
      members={members}
      rows={[{ id: 'event-1', kind: 'event', time: '7p', end: null, title: 'Soccer pickup', sub: null, owners: ['el'], past: false, now: false, startsAt: new Date(2026, 9, 10, 19).getTime() }]}
      homeRows={[]} kidsNow={[]} focusRows={[]} handoffs={[]} checklists={[{ member: members[1], list: null }]}
      bedtime={buildBedtimeGrid([])} dinner={dinner} nextMeal={null} comingUp={[]}
      question={null}
      groceryListTitle="Groceries" saveGroceries={props.save ?? (async (lines: GroceryLine[]) => lines.map((l) => ({ key: l.key, ok: true })))}
      personPage={null} recipePage={<div>Whole recipe here</div>} recipeTitle="Turkey chili"
      onOpenRecipe={vi.fn()} onTapRow={vi.fn()} onTick={vi.fn()} onClaim={vi.fn()} onTapQuestion={vi.fn()} flash={vi.fn()}
      {...props}
    />
  )
}

const onGroceries = vi.fn()
const onRecipes = vi.fn()
const onAdd = vi.fn()
const onTheme = vi.fn()
const tools: KioskTools = {
  onGroceries, onRecipes,
  more: [
    { id: 'task', label: 'Add', icon: Plus, onSelect: onAdd },
    { id: 'theme', label: 'Dark view', icon: Moon, onSelect: onTheme },
  ],
}
const place = () => screen.getByRole('heading', { level: 1 }).textContent
const bar = () => within(screen.getByRole('navigation', { name: 'Kiosk' }))

describe('KioskCanvas frame', () => {
  beforeEach(() => { localStorage.clear(); placeCall.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps the approved frame: clock, YOU ARE IN place, Household, then Home · Back · Call · Groceries · Recipes · More · Tell Symphony · NEXT', () => {
    render(<Harness />)
    expect(place()).toBe('Home · Evening')
    expect(screen.getByText('YOU ARE IN')).toBeInTheDocument()
    expect(screen.getByText('Household')).toBeInTheDocument()
    expect(screen.getByText('5:30 PM')).toBeInTheDocument()
    const names = bar().getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['Home', 'Back', 'Call — kidsPhone', 'Groceries', 'Recipes', 'More', 'Tell Symphony — Voice off · tap for commands'])
    expect(bar().getByRole('button', { name: /Back/ })).toBeDisabled()
    expect(bar().getByText('7p · Soccer pickup · Ella')).toBeInTheDocument()
    // No row of tool icons on the stage.
    expect(within(screen.getByRole('main')).queryByRole('button', { name: /Groceries|Recipes|kidsPhone/ })).toBeNull()
  })

  it('primary tools act directly; secondary ones live in one More sheet', () => {
    render(<Harness />)
    fireEvent.click(bar().getByRole('button', { name: 'Groceries' }))
    expect(onGroceries).toHaveBeenCalled()
    fireEvent.click(bar().getByRole('button', { name: 'More' }))
    const sheet = screen.getByRole('dialog', { name: 'More' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Dark view/ }))
    expect(onTheme).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull()
    fireEvent.click(bar().getByRole('button', { name: 'Call — kidsPhone' }))
    expect(place()).toBe('Calling')
  })

  it('evening keeps its board structure: Dinner (wide), Tonight, Bedtime — with calm lines when empty', () => {
    render(<Harness />)
    expect(screen.getByRole('region', { name: 'Dinner' })).toHaveTextContent('Turkey chili')
    expect(screen.getByRole('region', { name: 'Tonight' })).toHaveTextContent('Nothing else on tonight.')
    expect(screen.getByRole('region', { name: 'Bedtime' })).toHaveTextContent('No bedtime routine tonight.')
  })

  it('dinner → serves 6 scales with "was" marks → cooking → interruption → exact return', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients' }))
    expect(place()).toBe('Dinner · Turkey chili')
    fireEvent.click(screen.getByRole('button', { name: 'More servings' }))
    fireEvent.click(screen.getByRole('button', { name: 'More servings' }))
    expect(screen.getByText('Changed from 4 · quantities updated')).toBeInTheDocument()
    const turkey = screen.getByRole('button', { name: '2 lb ground turkey' })
    expect(turkey).toHaveTextContent('Ground turkey')
    expect(turkey).toHaveTextContent('3 lb')
    expect(turkey).toHaveTextContent('was 2 lb')

    fireEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    expect(place()).toBe('Cooking · Turkey chili for 6 · step 1 of 3')
    expect(screen.getByText('Heat the oil and soften the onion.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }))
    expect(place()).toBe('Cooking · Turkey chili for 6 · step 2 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Timer' }))
    fireEvent.click(screen.getByRole('button', { name: '5 min' }))
    expect(screen.getByRole('list', { name: 'Timers' })).toHaveTextContent('5:00')

    // Another activity takes the stage; cooking is held in the left column.
    fireEvent.click(bar().getByRole('button', { name: 'Call — kidsPhone' }))
    expect(place()).toBe('Calling · cooking is held')
    const held = screen.getByRole('complementary', { name: 'Cooking, held' })
    expect(held).toHaveTextContent('Cooking · held at step 2')
    expect(held).toHaveTextContent('Brown the turkey.')
    expect(held).toHaveTextContent('5:00')
    expect(bar().getByRole('button', { name: 'Cooking · step 2 · 5:00' })).toBeInTheDocument()

    fireEvent.click(within(held).getByRole('button', { name: 'Back to cooking' }))
    expect(place()).toBe('Cooking · Turkey chili for 6 · step 2 of 3')
    expect(screen.getByRole('list', { name: 'Timers' })).toBeInTheDocument()
  })

  it('Home shows held cooking as a chip only, not a column', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    fireEvent.click(bar().getByRole('button', { name: 'Home' }))
    expect(screen.queryByRole('complementary', { name: 'Cooking, held' })).toBeNull()
    expect(bar().getByRole('button', { name: /Cooking · step 1/ })).toBeInTheDocument()
  })

  it('a reload restores cooking at the same step with the timer counting from its end time', () => {
    const { unmount } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }))
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }))
    fireEvent.click(screen.getByRole('button', { name: /20 min timer/ }))
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
    render(<Harness save={save} groceryListItems={['Milk']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients' }))
    fireEvent.click(screen.getByRole('button', { name: /olive oil/ })) // we have oil
    fireEvent.click(screen.getByRole('button', { name: /Add what’s missing · 3/ }))
    expect(place()).toBe('Dinner · Groceries')
    expect(screen.getByRole('heading', { name: 'Add these to Groceries?' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Groceries list' })).toHaveTextContent('Milk')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 3 to Groceries' })) })
    expect(calls[0]).toEqual(['2 lb ground turkey', '1 onion, diced', '2 cans kidney beans'])
    expect(screen.getByRole('button', { name: '1 onion, diced — Didn’t save' })).toBeInTheDocument()
    expect(screen.getAllByText('Added')).toHaveLength(2)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Retry 1/ })) })
    expect(calls[1]).toEqual(['1 onion, diced'])
    expect(screen.getAllByText('Added')).toHaveLength(3)
  })

  it('Tell Symphony runs the same commands as the buttons, and says what it heard', () => {
    render(<Harness />)
    fireEvent.click(bar().getByRole('button', { name: /Tell Symphony/ }))
    const panel = screen.getByRole('dialog', { name: 'Tell Symphony' })
    expect(within(panel).getByRole('switch', { name: /Voice commands: Off/ })).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText('Type a command'), { target: { value: 'we have six people' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Do it' }))
    expect(place()).toBe('Dinner · Turkey chili')
    expect(bar().getByText('Heard: “we have six people”')).toBeInTheDocument()
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
    fireEvent.click(bar().getByRole('button', { name: 'Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients' }))
    expect(place()).toBe('Dinner · Turkey chili · cooking is held')
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(place()).toBe('Home · Evening')
    expect(bar().getByRole('button', { name: /Cooking · step 1/ })).toBeInTheDocument()
  })

  it('calling sits inside the frame and never dials without a confirm naming the recipient', () => {
    render(<Harness />)
    fireEvent.click(bar().getByRole('button', { name: 'Call — kidsPhone' }))
    expect(place()).toBe('Calling')
    fireEvent.click(screen.getByRole('button', { name: 'Grandma' }))
    expect(placeCall).not.toHaveBeenCalled()
    const panel = screen.getByRole('region', { name: 'Confirm call' })
    expect(within(panel).getByRole('heading', { name: 'Call Grandma?' })).toBeInTheDocument()
    expect(within(panel).getByText(/Rings the kidsPhone handset/)).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(bar().getByRole('button', { name: /Back/ }))
    expect(place()).toBe('Home · Evening')
    expect(placeCall).not.toHaveBeenCalled()
  })
})
