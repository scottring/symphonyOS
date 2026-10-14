import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
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
vi.mock('@/lib/wall/voice/wallVoiceActions', () => ({
  askWall: vi.fn(async (): Promise<{ answer: string } | { change: string }> => ({ answer: 'Turkey chili.' })),
  speechFor: vi.fn(async () => null),
}))
vi.mock('@/hooks/useHandsetState', () => ({ useHandsetState: () => ({ offHook: false }) }))
const placeCall = vi.fn()
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }))

import { KioskCanvas, type KioskCanvasProps, type KioskTools, type KioskV1Data } from './KioskCanvas'
import { Plus, Moon, Sun as SunIcon } from 'lucide-react'
import { useWallTheme } from '../wallThemeOverride'
import { useKioskActivity } from './useKioskActivity'
import type { KioskDinner } from './KioskStages'
import type { FamilyMember } from '@/types/family'
import type { GroceryLine, GroceryLineResult } from '@/lib/wall/activity/groceryProposal'
import { buildBedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import { askWall } from '@/lib/wall/voice/wallVoiceActions'

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

const v1Rest: KioskV1Data = {
  pick: { screen: 'rest', title: 'A quiet afternoon', dark: false },
  anchors: { morning: null, home: null, dinner: null, bedtime: null } as unknown as KioskV1Data['anchors'],
  kids: [], restLine: 'Quiet', restSub: null, notes: [], talks: [], question: null,
  tomorrow: { label: 'Thursday', outTheDoor: null, specials: [] },
  weekend: { rows: [], anytime: [], tomorrow: [], tomorrowLabel: 'Thursday' },
  onNotes: vi.fn(), next: null,
}
const topBand = () => within(screen.getByRole('banner'))
const dock = () => within(screen.getByRole('contentinfo', { name: 'Kiosk' }))

describe('Kitchen wall v2: the frame', () => {
  beforeEach(() => { localStorage.clear() })

  it('the top band has no Settings button; More opens in place of the side column, not as a sheet', () => {
    render(<Harness v1={v1Rest} />)
    expect(topBand().queryByRole('button', { name: 'Settings' })).toBeNull()
    expect(topBand().getByRole('heading', { level: 1 })).toHaveTextContent('A quiet afternoon')
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const more = screen.getByRole('region', { name: 'More' })
    expect(within(more).getAllByRole('button').map((b) => b.querySelector('b')?.textContent ?? b.textContent))
      .toEqual(['Done', 'Recipes', 'Call', 'Dark view', 'Voice is off'])
    // The lead stays, the side column gives way.
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'The rest of today' })).toBeNull()
    fireEvent.click(within(more).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('region', { name: 'More' })).toBeNull()
    expect(screen.getByRole('complementary', { name: 'The rest of today' })).toBeInTheDocument()
  })

  it('More has a Recipes tile (the places moved off the moments); Type instead is gone', () => {
    onRecipes.mockClear()
    render(<Harness v1={v1Rest} />)
    expect(screen.queryByRole('navigation', { name: 'Places' })).toBeNull()
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    expect(screen.queryByRole('button', { name: /Type instead/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Recipes/ }))
    expect(onRecipes).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'More' })).toBeNull()
  })

  it('Home shows only away from Home: not on a home moment; in More and inside an activity', () => {
    render(<Harness v1={v1Rest} />)
    const navNames = () => within(dock().getByRole('navigation', { name: 'Wall' })).getAllByRole('button').map((b) => b.textContent)
    expect(navNames()).toEqual(['More'])
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    expect(navNames()).toEqual(['Home', 'More'])
    fireEvent.click(dock().getByRole('button', { name: 'Home' }))
    expect(navNames()).toEqual(['More'])
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: /^Call/ }))
    expect(navNames()).toEqual(['Home', 'Back', 'More'])
  })

  it('without a listener, a tap on the mic opens the strip with the field focused; what is typed runs like speech', () => {
    render(<Harness v1={v1Rest} />)
    const strip = () => dock().getByRole('button', { name: /Talk to Symphony/ }).closest('.kw-talk') as HTMLElement
    expect(strip()).toHaveAttribute('data-strip', 'collapsed')
    fireEvent.click(dock().getByRole('button', { name: /Talk to Symphony/ }))
    const field = dock().getByLabelText('Type to Symphony')
    expect(field).toHaveFocus()
    expect(field.closest('.kw-talk')).toHaveAttribute('data-strip', 'open')
    fireEvent.change(field, { target: { value: 'timer 5 minutes' } })
    fireEvent.click(dock().getByRole('button', { name: 'Send' }))
    const reply = screen.getByRole('status', { name: 'Symphony says' })
    expect(reply).toHaveTextContent('You said “timer 5 minutes”')
    expect(reply).toHaveTextContent('Timer · 5 min')
    expect(dock().queryByLabelText('Type to Symphony')).toBeNull()
  })

  it('the strip stays open where hands are busy (out the door), collapsed elsewhere', () => {
    const anchors = { morning: { start: 405, end: 440 }, home: { start: 1035 }, dinner: 1080, bedtime: { start: 1170, end: 1230 } }
    const { unmount } = render(<Harness v1={{ ...v1Rest, anchors, pick: { screen: 'out-the-door', title: 'Out the door', dark: false } }} />)
    const strip = () => dock().getByRole('button', { name: /Talk to Symphony/ }).closest('.kw-talk') as HTMLElement
    expect(strip()).toHaveAttribute('data-strip', 'open')
    expect(dock().getByText('Tap a step or say it')).toBeInTheDocument()
    unmount()
    for (const screenName of ['rest', 'home', 'dinner', 'bedtime', 'night', 'weekend'] as const) {
      const r = render(<Harness v1={{ ...v1Rest, anchors, pick: { screen: screenName, title: screenName, dark: false } }} />)
      expect(strip()).toHaveAttribute('data-strip', 'collapsed')
      r.unmount()
    }
  })

  it('an open field left empty folds back to the mic after the idle time', () => {
    vi.useFakeTimers()
    render(<Harness v1={v1Rest} />)
    fireEvent.click(dock().getByRole('button', { name: /Talk to Symphony/ }))
    expect(dock().getByLabelText('Type to Symphony')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(121_000) })
    expect(dock().queryByLabelText('Type to Symphony')).toBeNull()
    expect(dock().getByRole('button', { name: /Talk to Symphony/ }).closest('.kw-talk')).toHaveAttribute('data-strip', 'collapsed')
    vi.useRealTimers()
  })
})

// Wired like WallV2Shell: the automatic value feeds the hook, the effective
// value goes into the v1 pick and the More panel's theme tile.
function ThemedWall({ auto }: { auto: boolean }) {
  const { dark, toggle } = useWallTheme(auto)
  const themed: KioskTools = {
    ...tools,
    more: [
      ...tools.more.filter((m) => m.id !== 'theme'),
      { id: 'theme', label: dark ? 'Light view' : 'Dark view', sub: 'Until the wall switches by itself', icon: dark ? SunIcon : Moon, onSelect: toggle },
    ],
  }
  return <Harness isDark={dark} tools={themed} v1={{ ...v1Rest, pick: { ...v1Rest.pick, dark } }} />
}

describe('More: Dark view / Light view on the v1 wall', () => {
  beforeEach(() => { localStorage.clear() })

  it('the label follows the effective theme, toggles in place, and survives a remount', () => {
    const { container, unmount } = render(<ThemedWall auto={false} />)
    const canvas = () => container.querySelector('.kiosk-canvas') as HTMLElement
    expect(canvas()).not.toHaveClass('is-dark')
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: /Dark view/ }))
    expect(canvas()).toHaveClass('is-dark')
    // More stays open so the new label shows.
    expect(screen.getByRole('button', { name: /Light view/ })).toHaveTextContent('Until the wall switches by itself')
    unmount()
    const again = render(<ThemedWall auto={false} />)
    expect(again.container.querySelector('.kiosk-canvas')).toHaveClass('is-dark')
    again.unmount()
    // Dark automatically (after dinner): the tile offers Light view.
    const later = render(<ThemedWall auto={true} />)
    expect(later.container.querySelector('.kiosk-canvas')).toHaveClass('is-dark')
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    expect(screen.getByRole('button', { name: /Light view/ })).toBeInTheDocument()
    expect(localStorage.getItem('symphony-wall-theme-override')).toBeNull()
    later.unmount()
  })
})

// The Pi's listener, as the page sees it: a local WebSocket.
class FakeSocket {
  static last: FakeSocket | null = null
  static OPEN = 1
  readyState = 0
  sent: Record<string, unknown>[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) { FakeSocket.last = this }
  send(d: string) { this.sent.push(JSON.parse(d)) }
  close() { this.onclose?.() }
  open(over: object = {}) {
    this.readyState = 1
    this.onopen?.()
    this.emit({ type: 'state', state: 'ready', wake: 'Hey Symphony', muted: false, quiet: false, ...over })
  }
  emit(m: object) { this.onmessage?.({ data: JSON.stringify(m) }) }
}

describe('Kitchen wall v2: the conversation dock', () => {
  const realWS = globalThis.WebSocket
  beforeEach(() => { localStorage.clear(); (globalThis as { WebSocket: unknown }).WebSocket = FakeSocket; FakeSocket.last = null; vi.mocked(askWall).mockClear() })
  afterEach(() => { (globalThis as { WebSocket: unknown }).WebSocket = realWS })
  const voice = { save: vi.fn(async () => ({ said: 'Saved.' })), snapshot: () => 'Today: nothing' }

  const strip = () => dock().getByRole('button', { name: /Talk to Symphony|Stop listening/ }).closest('.kw-talk') as HTMLElement

  it('at rest the strip is one round mic, with no suggestion chips', async () => {
    render(<Harness v1={{ ...v1Rest, pick: { screen: 'home', title: 'Home from school', dark: false } }} voice={voice} />)
    await act(async () => FakeSocket.last!.open())
    expect(strip()).toHaveAttribute('data-strip', 'collapsed')
    expect(dock().getByRole('button', { name: /Talk to Symphony/ })).toHaveClass('is-solo')
    expect(dock().queryByRole('button', { name: 'Start a 20-minute timer' })).toBeNull()
    expect(screen.getByRole('contentinfo', { name: 'Kiosk' }).querySelector('.kw-chip:not(.is-send)')).toBeNull()
  })

  it('a tap on the mic opens the strip: listening started and the field focused', async () => {
    render(<Harness v1={v1Rest} voice={voice} />)
    await act(async () => FakeSocket.last!.open())
    fireEvent.click(dock().getByRole('button', { name: /Talk to Symphony/ }))
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'listen' })
    expect(dock().getByLabelText('Type to Symphony')).toHaveFocus()
    expect(strip()).toHaveAttribute('data-strip', 'open')
    await act(async () => FakeSocket.last!.emit({ type: 'state', state: 'listening', wake: 'Hey Symphony' }))
    expect(dock().getByText('Listening — or type')).toBeInTheDocument()
    // Spoken: listening ends, the field closes, Symphony answers in the band.
    await act(async () => {
      FakeSocket.last!.emit({ type: 'heard', id: '1', text: 'timer 5 minutes', via: 'tap' })
      FakeSocket.last!.emit({ type: 'state', state: 'ready', wake: 'Hey Symphony' })
    })
    expect(dock().queryByLabelText('Type to Symphony')).toBeNull()
    expect(screen.getByRole('status', { name: 'Symphony says' })).toHaveTextContent('Timer · 5 min')
    expect(strip()).toHaveAttribute('data-strip', 'open')
  })

  it('"Hey Symphony" opens the strip too, and it stays open while Symphony speaks', async () => {
    render(<Harness v1={v1Rest} voice={voice} />)
    await act(async () => FakeSocket.last!.open())
    expect(strip()).toHaveAttribute('data-strip', 'collapsed')
    await act(async () => FakeSocket.last!.emit({ type: 'state', state: 'listening', wake: 'Hey Symphony' }))
    expect(strip()).toHaveAttribute('data-strip', 'open')
    expect(dock().getByLabelText('Type to Symphony')).toBeInTheDocument()
    await act(async () => FakeSocket.last!.emit({ type: 'state', state: 'speaking', wake: 'Hey Symphony' }))
    expect(strip()).toHaveAttribute('data-strip', 'open')
    expect(dock().getByText('Symphony is speaking · tap to talk')).toBeInTheDocument()
  })

  it('a question goes to Symphony, and the reply band shows the whole answer', async () => {
    const long = 'Tonight is turkey chili at 6:30. Thursday is not planned yet. Friday the kids are with Grandpa and home about 8, so nothing to cook. Saturday is pizza night at 6, and Sunday is not planned yet either — you could ask me to plan the rest of the week and I will suggest something from your recipes.'
    vi.mocked(askWall).mockResolvedValueOnce({ answer: long })
    render(<Harness v1={v1Rest} voice={voice} />)
    await act(async () => FakeSocket.last!.open())
    fireEvent.click(dock().getByRole('button', { name: /Talk to Symphony/ }))
    fireEvent.change(dock().getByLabelText('Type to Symphony'), { target: { value: 'What’s for dinner this week?' } })
    await act(async () => { fireEvent.click(dock().getByRole('button', { name: 'Send' })) })
    await waitFor(() => expect(askWall).toHaveBeenCalledWith("What's for dinner this week?", 'Today: nothing'))
    const band = await screen.findByRole('status', { name: 'Symphony says' })
    expect(within(band).getByText(long)).toBeInTheDocument()
    expect(within(band).getByText(long)).toHaveClass('is-mid')
    // An answer is away from Home: Home is back in the bar.
    expect(dock().getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('quiet hours: a collapsed, outlined mic with a slash; a tap still talks', async () => {
    render(<Harness v1={v1Rest} voice={voice} />)
    await act(async () => FakeSocket.last!.open({ state: 'quiet', quiet: true }))
    const mic = dock().getByRole('button', { name: /Talk to Symphony/ })
    expect(mic).toHaveAccessibleName(/quiet hours/)
    expect(mic).toHaveClass('is-solo', 'is-off')
    expect(strip()).toHaveAttribute('data-strip', 'collapsed')
    fireEvent.click(mic)
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'listen' })
    expect(strip()).toHaveAttribute('data-strip', 'open')
  })

  it('More: listening on/off is a tile that mutes the listener', async () => {
    render(<Harness v1={v1Rest} voice={voice} />)
    await act(async () => FakeSocket.last!.open())
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: /Listening is on/ }))
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'mute', on: true })
  })
})
