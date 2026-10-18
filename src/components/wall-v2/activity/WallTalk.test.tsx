import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import { Sun } from 'lucide-react'

// No network: Supabase, the agent and wall-ask are all stubbed. The agent is
// a fake handed in through voice.agent.ask; Approve calls a fake apply.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn(), auth: { getSession: vi.fn() } } }))
vi.mock('@/hooks/useRecipe', () => ({ useRecipe: () => ({ recipe: null, loading: false, error: null }) }))
vi.mock('@/hooks/useKidPhoneContacts', () => ({
  useKidPhoneContacts: () => ({ contacts: [], favorites: [], others: [], loading: false, error: undefined }),
  callableContacts: (cs: unknown[]) => cs,
  partitionContacts: () => ({ favorites: [], others: [] }),
}))
vi.mock('@/lib/wall/voice/wallVoiceActions', () => ({
  askWall: vi.fn(async (): Promise<{ answer: string } | { change: string }> => ({ answer: 'Swim is at 10 tomorrow.' })),
  speechFor: vi.fn(async () => null),
}))
vi.mock('@/hooks/useHandsetState', () => ({ useHandsetState: () => ({ offHook: false }) }))
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: vi.fn() }))

import { KioskCanvas, type KioskCanvasProps, type KioskTools, type KioskV1Data } from './KioskCanvas'
import { useKioskActivity } from './useKioskActivity'
import type { FamilyMember } from '@/types/family'
import { buildBedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import { askWall } from '@/lib/wall/voice/wallVoiceActions'
import type { WallAgentReply, WallTurn } from '@/lib/wall/wallAgent'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import type { WallTalkWeek } from './WallTalk'
import type { WallTalkDeps, WallApplyResult } from './useWallTalk'

const NOW = new Date(2026, 9, 10, 15, 0) // Sat Oct 10
const members = [{ id: 'sk', name: 'Scott', initials: 'SK' }, { id: 'el', name: 'Ella', initials: 'EL' }] as unknown as FamilyMember[]
const tools: KioskTools = { onGroceries: vi.fn(), onRecipes: vi.fn(), more: [] }

const day = (n: number) => new Date(2026, 9, 10 + n)
const week: WallTalkWeek = {
  days: [0, 1, 2, 3, 4, 5, 6].map((n) => ({
    date: day(n),
    rows: n === 1 ? [
      { id: 'task-swim', kind: 'task' as const, time: '10a', end: null, title: 'Swim lesson', sub: null, owners: ['el'], past: false, now: false, startsAt: new Date(2026, 9, 11, 10).getTime() },
      { id: 'event-b', kind: 'event' as const, time: '2p', end: null, title: 'Birthday party', sub: null, owners: ['el'], past: false, now: false, startsAt: new Date(2026, 9, 11, 14).getTime() },
    ] : [],
  })),
  task: (id) => (id === 'swim' ? { title: 'Swim lesson', at: new Date(2026, 9, 11, 10), allDay: false, who: ['Ella'] } : null),
}

const SET: ChangeSet = {
  key: 'set-1', title: 'Swim on Friday, plumber Saturday',
  ops: [
    { key: 'o1', op: 'place', taskId: 'swim', title: 'Swim lesson', date: '2026-10-16', time: '10:00' },
    { key: 'o2', op: 'add', title: 'Call the plumber', date: '2026-10-17', time: '10:00' },
  ],
}

const v1 = (screenName: 'rest' | 'out-the-door' = 'rest'): KioskV1Data => ({
  pick: { screen: screenName, title: screenName === 'rest' ? 'A quiet afternoon' : 'Out the door in 10 minutes', dark: false },
  anchors: { morning: null, home: null, dinner: null, bedtime: { start: 1170, end: 1230 } } as unknown as KioskV1Data['anchors'],
  kids: [], restLine: 'Quiet', restSub: null, notes: [], talks: [], question: null,
  tomorrow: { label: 'Sunday', outTheDoor: null, specials: [] },
  weekend: { rows: [], anytime: [], tomorrow: [], tomorrowLabel: 'Sunday' },
  onNotes: vi.fn(), next: null,
})

type Ask = (text: string, history: readonly WallTurn[], opts?: unknown) => Promise<WallAgentReply>
const reply = (text: string, history: readonly WallTurn[], said: string, extra: Partial<WallAgentReply> = {}): WallAgentReply =>
  ({ reply: said, history: [...history, { role: 'user', content: text }, { role: 'assistant', content: said }], ...extra })

function setup(ask: Ask, over: Partial<KioskCanvasProps> = {}) {
  const undo = vi.fn(async () => true)
  const applyChanges = vi.fn(async (): Promise<WallApplyResult> => ({ ok: true, ids: ['swim', 'new'], undo }))
  const save = vi.fn(async () => ({ said: 'Added milk to Groceries.' }))
  const agent: WallTalkDeps = { ask: vi.fn(ask) as never, applyChanges, weekStartsOn: 1 }
  const voice = { save, snapshot: () => 'Today: nothing', agent }
  function Harness() {
    const activity = useKioskActivity('2026-10-10')
    return (
      <KioskCanvas
        isDark={false} activity={activity} now={NOW} moment="dinner" dateLabel="Saturday, October 10" clock="3:00 PM"
        weather={{ icon: Sun, temp: 61, condition: 'Clear' }} tools={tools} members={members}
        rows={[]} homeRows={[]} kidsNow={[]} focusRows={[]} handoffs={[]} checklists={[]}
        bedtime={buildBedtimeGrid([])} dinner={null} nextMeal={null} comingUp={[]} question={null}
        groceryListTitle="Groceries" saveGroceries={async () => []}
        personPage={null} recipePage={null} recipeTitle={null}
        onOpenRecipe={vi.fn()} onTapRow={vi.fn()} onTick={vi.fn()} onClaim={vi.fn()} onTapQuestion={vi.fn()} flash={vi.fn()}
        voice={voice} week={week} v1={v1()}
        {...over}
      />
    )
  }
  render(<Harness />)
  return { agent, applyChanges, undo, save, ask: agent.ask as unknown as ReturnType<typeof vi.fn> }
}

const dock = () => within(screen.getByRole('contentinfo', { name: 'Kiosk' }))
async function type(text: string) {
  fireEvent.click(dock().getByRole('button', { name: /Talk to Symphony/ }))
  fireEvent.change(dock().getByLabelText('Type to Symphony'), { target: { value: text } })
  await act(async () => { fireEvent.click(dock().getByRole('button', { name: 'Send' })) })
}
const side = () => within(screen.getByRole('region', { name: 'Talking with Symphony' }))

describe('talking to the wall: routing', () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(askWall).mockClear() })

  it('kiosk commands, groceries and Inbox captures stay local and instant; Symphony is not asked', async () => {
    const { ask, save } = setup(async (t, h) => reply(t, h, 'never'))
    await type('timer 5 minutes')
    expect(screen.getByRole('status', { name: 'Symphony says' })).toHaveTextContent('Timer · 5 min')
    await type('add milk to the grocery list')
    expect(save).toHaveBeenCalledWith({ kind: 'groceries', items: ['milk'] })
    await type('remind us to call the plumber')
    expect(save).toHaveBeenLastCalledWith({ kind: 'inbox', text: 'Call the plumber' })
    await type("don't forget to return the library books")
    expect(save).toHaveBeenLastCalledWith({ kind: 'inbox', text: 'Return the library books' })
    expect(ask).not.toHaveBeenCalled()
    expect(askWall).not.toHaveBeenCalled()
  })

  it('a question goes to Symphony, and the next turn carries the conversation', async () => {
    const { ask } = setup(async (t, h) => reply(t, h, h.length ? 'At 2, at the bowling alley.' : 'Swim at 10 and a birthday party at 2.'))
    await type('What do we have tomorrow?')
    expect(ask).toHaveBeenCalledWith('What do we have tomorrow?', [], expect.objectContaining({ turnId: expect.any(String) }))
    await type('when is the party')
    expect(ask).toHaveBeenLastCalledWith('when is the party', [
      { role: 'user', content: 'What do we have tomorrow?' }, { role: 'assistant', content: 'Swim at 10 and a birthday party at 2.' },
    ], expect.anything())
    expect(askWall).not.toHaveBeenCalled()
  })

  it('a sentence said while Symphony is answering waits its turn and carries the first exchange', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const { ask } = setup(async (t, h) => { if (!h.length) await gate; return reply(t, h, h.length ? 'Second.' : 'First.') })
    await type('What do we have tomorrow?')
    await type('and Friday?')
    expect(ask).toHaveBeenCalledTimes(1)
    await act(async () => { release() })
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
    expect(ask).toHaveBeenLastCalledWith('and Friday?', [
      { role: 'user', content: 'What do we have tomorrow?' }, { role: 'assistant', content: 'First.' },
    ], expect.anything())
  })

  it('when Symphony fails, wall-ask answers and the wall says so', async () => {
    setup(async () => { throw new Error('Assistant offline') })
    await type('What do we have tomorrow?')
    await waitFor(() => expect(askWall).toHaveBeenCalled())
    expect(await side().findByText(/Symphony couldn’t answer just now, so here’s the wall’s quick answer: Swim is at 10 tomorrow\./)).toBeInTheDocument()
  })
})

describe('talking to the wall: the conversation surface', () => {
  beforeEach(() => { localStorage.clear() })

  it('on a two-column moment the side column becomes the conversation: You, then Symphony; Back to today returns', async () => {
    setup(async (t, h) => reply(t, h, 'Swim at 10 and a birthday party at 2.'))
    expect(screen.getByRole('complementary', { name: 'The rest of today' })).toBeInTheDocument()
    await type('What do we have tomorrow?')
    const convo = side()
    expect(convo.getByText('What do we have tomorrow?')).toBeInTheDocument()
    expect(convo.getByText('Swim at 10 and a birthday party at 2.')).toBeInTheDocument()
    expect(convo.getAllByText('You').length).toBeGreaterThan(0)
    // No duplicate in the reply band.
    expect(screen.queryByRole('status', { name: 'Symphony says' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Back to today/ }))
    expect(screen.queryByRole('region', { name: 'Talking with Symphony' })).toBeNull()
    expect(screen.getByRole('complementary', { name: 'The rest of today' })).toBeInTheDocument()
  })

  it('on a full-stage moment (out the door) the exchange shows in the reply band', async () => {
    setup(async (t, h) => reply(t, h, 'Yes, jacket weather.'), { v1: v1('out-the-door') })
    await type('Is it a jacket day?')
    expect(screen.queryByRole('region', { name: 'Talking with Symphony' })).toBeNull()
    const band = screen.getByRole('status', { name: 'Symphony says' })
    expect(band).toHaveTextContent('You said “Is it a jacket day?”')
    expect(band).toHaveTextContent('Yes, jacket weather.')
  })

  it('pointed days take the lead: "Showing · tomorrow" with that day’s family rows', async () => {
    setup(async (t, h) => reply(t, h, 'Swim at 10 and a party at 2.', { pointed: { dates: ['2026-10-11'], taskIds: [] } }))
    await type('What do we have tomorrow?')
    expect(screen.getByText('Showing · tomorrow')).toBeInTheDocument()
    const dayPic = screen.getByRole('group', { name: 'Sunday, October 11' })
    expect(within(dayPic).getByText('Swim lesson')).toBeInTheDocument()
    expect(within(dayPic).getByText('Birthday party')).toBeInTheDocument()
  })
})

describe('talking to the wall: the change card', () => {
  beforeEach(() => { localStorage.clear() })
  const proposing = (set = SET): Ask => async (t, h) => reply(t, h, 'Swim moves to Friday and the plumber call goes on Saturday. Approve?', { changeSet: set })

  it('a change set shows the wall-size card and draws the proposals dashed, the old slot dotted', async () => {
    const { applyChanges } = setup(proposing())
    await type("Move swim to Friday and add 'Call the plumber' Saturday at 10")
    const card = screen.getByRole('region', { name: 'Proposed changes' })
    expect(within(card).getByText('Swim on Friday, plumber Saturday')).toBeInTheDocument()
    expect(within(card).getByText('Sun 10:00 → Fri 10:00 · Ella')).toBeInTheDocument()
    expect(within(card).getByText('Sat 10:00')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /Approve/ })).toBeInTheDocument()
    expect(screen.getByText('Only family plans can change from the wall.')).toBeInTheDocument()
    // The lead: the days the card touches.
    const sun = screen.getByRole('group', { name: 'Sunday, October 11' })
    expect(within(sun).getByText('Swim lesson').closest('[data-kind]')).toHaveAttribute('data-kind', 'trace')
    expect(within(sun).getByText('Birthday party').closest('[data-kind]')).toHaveAttribute('data-kind', 'plain')
    const fri = screen.getByRole('group', { name: 'Friday, October 16' })
    expect(within(fri).getByText('Swim lesson').closest('[data-kind]')).toHaveAttribute('data-kind', 'prop')
    const sat = screen.getByRole('group', { name: 'Saturday, October 17' })
    expect(within(sat).getByText('Call the plumber').closest('[data-kind]')).toHaveAttribute('data-kind', 'prop')
    // Never applied by itself.
    expect(applyChanges).not.toHaveBeenCalled()
  })

  it('while the card waits the strip stays open and says how to answer', async () => {
    setup(proposing())
    const strip = () => dock().getByRole('button', { name: /Talk to Symphony/ }).closest('.kw-talk') as HTMLElement
    expect(strip()).toHaveAttribute('data-strip', 'collapsed')
    await type("Move swim to Friday and add 'Call the plumber' Saturday at 10")
    expect(screen.getByRole('region', { name: 'Proposed changes' })).toBeInTheDocument()
    expect(strip()).toHaveAttribute('data-strip', 'open')
    expect(dock().getByText('Say “approve”, or say what to change')).toBeInTheDocument()
    // Planning is away from Home: Home is in the bar.
    expect(dock().getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('Approve applies through the shared apply, then Undo reverses it', async () => {
    const { applyChanges, undo } = setup(proposing())
    await type('Move swim to Friday')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Approve/ })) })
    expect(applyChanges).toHaveBeenCalledWith(SET)
    expect(screen.queryByRole('region', { name: 'Proposed changes' })).toBeNull()
    expect(screen.getByText('Saved · Swim on Friday, plumber Saturday')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Undo/ })) })
    expect(undo).toHaveBeenCalled()
  })

  it('Not now dismisses without saving, and the next turn is told', async () => {
    const { applyChanges, ask } = setup(proposing())
    await type('Move swim to Friday')
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Proposed changes' })).toBeNull()
    expect(applyChanges).not.toHaveBeenCalled()
    await type('what else is on Friday')
    expect(ask).toHaveBeenLastCalledWith('what else is on Friday', expect.any(Array), expect.objectContaining({ changeCard: expect.objectContaining({ state: 'dismissed' }) }))
  })

  it('saying "approve" while the card is up approves; a plain "yes" goes to Symphony', async () => {
    const { applyChanges, ask } = setup(proposing())
    await type('Move swim to Friday')
    await type('yes')
    expect(applyChanges).not.toHaveBeenCalled()
    expect(ask).toHaveBeenCalledTimes(2)
    await type('Yes, do it')
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('further talk revises the card: the new set replaces the old one', async () => {
    let n = 0
    const revised: ChangeSet = { key: 'set-2', title: 'Swim on Thursday', ops: [{ key: 'o3', op: 'place', taskId: 'swim', title: 'Swim lesson', date: '2026-10-15', time: '10:00' }] }
    const { applyChanges } = setup(async (t, h) => reply(t, h, n++ ? 'Thursday then.' : 'Friday it is.', { changeSet: n === 1 ? SET : revised }))
    await type('Move swim to Friday')
    expect(screen.getByText('Swim on Friday, plumber Saturday')).toBeInTheDocument()
    await type('actually make it Thursday and skip the plumber')
    expect(screen.queryByText('Swim on Friday, plumber Saturday')).toBeNull()
    expect(screen.getByText('Swim on Thursday')).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Proposed changes' })).toHaveLength(1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Approve/ })) })
    expect(applyChanges).toHaveBeenCalledWith(revised)
  })

  it('a spoken "approve" means the card the wall last read out, after a revision too', async () => {
    let n = 0
    const revised: ChangeSet = { key: 'set-2', title: 'Swim on Thursday', ops: [{ key: 'o3', op: 'place', taskId: 'swim', title: 'Swim lesson', date: '2026-10-15', time: '10:00' }] }
    const { applyChanges } = setup(async (t, h) => reply(t, h, n++ ? 'Thursday then.' : 'Friday it is.', { changeSet: n === 1 ? SET : revised }))
    await type('Move swim to Friday')
    await type('actually make it Thursday')
    await type('approve')
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(applyChanges).toHaveBeenCalledWith(revised)
  })

  it('a refusal (not a family task) is said on the card and nothing is saved', async () => {
    const { applyChanges } = setup(proposing())
    applyChanges.mockResolvedValueOnce({ ok: false, reason: 'private', title: 'Swim lesson' })
    await type('Move swim to Friday')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Approve/ })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Only family plans can change from the wall.')
    expect(screen.getByRole('region', { name: 'Proposed changes' })).toBeInTheDocument()
  })
})

describe('talking to the wall: plan the week', () => {
  // The opening phrase reads the real clock (startPlanning's `now = new Date()`),
  // not the wall's `now` prop, so pin it to NOW (Sat Oct 10): otherwise these fail
  // on the last day of a Monday week, when the phrase names next week.
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it('More → Plan the week starts the session with the desktop’s opening phrase and shows the family week', async () => {
    const { ask } = setup(async (t, h) => reply(t, h, 'Let’s plan the rest of the week. Sunday has swim and a party; Friday is open.'))
    fireEvent.click(dock().getByRole('button', { name: 'More' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Plan the week/ })) })
    expect(ask).toHaveBeenCalledWith('Help me plan the rest of my week.', [], expect.anything())
    expect(screen.getByText('Family only · October 10 – 16')).toBeInTheDocument()
    const pic = screen.getByLabelText('The family’s week')
    expect(within(pic).getAllByRole('group')).toHaveLength(7)
    expect(side().getByText('Plan the week')).toBeInTheDocument()
    expect(side().getByText(/Let’s plan the rest of the week/)).toBeInTheDocument()
  })

  it('saying "plan the week" starts it too; proposals land dashed in their days and the card waits behind Review', async () => {
    const { ask, applyChanges } = setup(async (t, h) => reply(t, h, 'Swim to Friday?', h.length ? { changeSet: SET } : {}))
    await type('plan the week')
    expect(ask).toHaveBeenCalledWith('Help me plan the rest of my week.', [], expect.anything())
    await type('move swim to Friday')
    const fri = screen.getByRole('group', { name: 'Friday, October 16' })
    expect(within(fri).getByText('Swim lesson').closest('[data-kind]')).toHaveAttribute('data-kind', 'prop')
    expect(screen.getByText('2 changes so far')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Proposed changes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('region', { name: 'Proposed changes' })).toBeInTheDocument()
    expect(applyChanges).not.toHaveBeenCalled()
  })
})

describe('talking to the wall: ending', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.useRealTimers() })

  it('two minutes of silence ends the conversation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup(async (t, h) => reply(t, h, 'Swim at 10.'))
    await type('What do we have tomorrow?')
    expect(screen.getByRole('region', { name: 'Talking with Symphony' })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(121_000) })
    expect(screen.queryByRole('region', { name: 'Talking with Symphony' })).toBeNull()
    // The strip folds back to the mic, and Home leaves the bar.
    expect(dock().getByRole('button', { name: /Talk to Symphony/ }).closest('.kw-talk')).toHaveAttribute('data-strip', 'collapsed')
    expect(dock().queryByRole('button', { name: 'Home' })).toBeNull()
  })

  it('Home ends it', async () => {
    setup(async (t, h) => reply(t, h, 'Swim at 10.'))
    await type('What do we have tomorrow?')
    fireEvent.click(dock().getByRole('button', { name: 'Home' }))
    expect(screen.queryByRole('region', { name: 'Talking with Symphony' })).toBeNull()
  })
})
