import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { Choice, ChoiceOption } from '@/types/choice'
import type { ChoiceDetail } from '@/lib/choices/db'
import type { LogEntry, PlannedEvent } from '@/types/goalLog'
import { localYmd, mergeLog } from '@/lib/choices/log'

type Undo = { undo?: () => Promise<unknown> }
const { run } = vi.hoisted(() => ({
  run: vi.fn(async (_label: string, command: () => Promise<unknown>, _opts?: Undo) => (await command()) !== false),
}))
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ run }) }))
// The page reads the log through useGoalLog and hands it to the view; the
// view never reads it itself.
vi.mock('@/hooks/useGoalLog', () => ({ useGoalLog: vi.fn(() => { throw new Error('the view must not read the log') }) }))
const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

import { ChoicePageView, type ChoicePageWriters, type PageLog } from './ChoicePage'

const now = new Date()
const goal = { kind: 'task', id: 'g1' } as const
const choice: Choice = {
  id: 'c1', userId: 'u', goal, title: 'Contractor', status: 'open',
  decidedWork: [], sortOrder: 0, createdAt: now, updatedAt: now, columns: [], work: [], selectedWork: [],
}
const opt = (id: string, name: string, order: number, o: Partial<ChoiceOption> = {}): ChoiceOption => ({
  id, choiceId: 'c1', userId: 'u', name, status: 'heard_back', statusChangedAt: new Date(2026, 9, 18),
  values: {}, sortOrder: order, updatedAt: now, ...o,
})
const detail: ChoiceDetail = {
  choice, goalTitle: 'Redo the bathrooms', goalContext: 'family', goalScope: 'compound',
  options: [
    opt('mar', 'Martinez Tile & Bath', 1, { status: 'considering' }),
    opt('che', 'Chesapeake Renovations', 2),
    opt('sch', 'Scher Remodeling', 3, { status: 'contacted', contactId: 'k1' }),
  ],
  lines: [], followUps: [], contacts: new Map(),
}

const entry = (o: Partial<LogEntry>): LogEntry => ({
  id: 'e1', userId: 'scott', goal, kind: 'call', on: '2026-10-22', summary: 'Can come Thursday', createdAt: new Date(2026, 9, 22), ...o,
})
const visit: PlannedEvent = {
  taskId: 't1', optionId: 'sch', kind: 'visit', title: 'Home visit: Walk through upstairs bath (Scher Remodeling)',
  scheduledFor: new Date(2026, 9, 30, 10, 0), allDay: false, completed: false,
}
const entries = [
  entry({ id: 'e1', optionId: 'sch' }),
  entry({ id: 'e2', kind: 'note', on: '2026-10-20', summary: 'Iris wants to keep the clawfoot tub', userId: 'iris' }),
]
const pageLog = (es: LogEntry[] = entries, planned: PlannedEvent[] = [visit]): PageLog => ({
  log: mergeLog(es, planned),
  entries: es,
  memberName: (id) => ({ scott: 'Scott', iris: 'Iris' } as Record<string, string>)[id],
})

function makeWriters() {
  return {
    readChoice: vi.fn(async () => ({ columns: [], work: [], selectedWork: [] })),
    readOptionValues: vi.fn(async () => ({})),
    setSelectedWork: vi.fn(async () => true),
    updateChoice: vi.fn(async () => true),
    deleteChoice: vi.fn(async () => true),
    addOption: vi.fn(async () => null),
    updateOption: vi.fn(async () => true),
    deleteOption: vi.fn(async () => true),
    addPriceLine: vi.fn(async () => null),
    updatePriceLine: vi.fn(async () => true),
    deletePriceLine: vi.fn(async () => true),
    createFollowUp: vi.fn(async () => 't9'),
    deleteTask: vi.fn(async () => true),
    chooseOption: vi.fn(async () => true),
    reopenChoice: vi.fn(async () => true),
    addContact: vi.fn(async () => ({ id: 'k9' })),
    deleteContact: vi.fn(async () => true),
    addLogEntry: vi.fn(async (input: Parameters<ChoicePageWriters['addLogEntry']>[0]) =>
      entry({ id: 'new', goal: input.goal, optionId: input.optionId, kind: input.kind, on: input.on, time: input.time, summary: input.summary })),
    updateLogEntry: vi.fn(async () => true),
    deleteLogEntry: vi.fn(async () => true),
    planEvent: vi.fn(async () => 'tnew'),
  } satisfies ChoicePageWriters
}
let w: ReturnType<typeof makeWriters>

function setWide() {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const rowOf = (name: string) => screen.getAllByText(name).map((el) => el.closest('tr')).find(Boolean) as HTMLElement
const dialog = () => screen.getByRole('dialog')
const lastUndo = () => run.mock.calls[run.mock.calls.length - 1][2]!.undo!
const dayFrom = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function openLogFor(name: string) {
  await userEvent.click(within(rowOf(name)).getByRole('button', { name: 'Log' }))
  return dialog()
}

describe('the log on the comparison page', () => {
  beforeEach(() => { setWide(); run.mockClear(); navigate.mockClear(); w = makeWriters() })

  it('each row has Log, which opens the dialog about that option', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    for (const o of detail.options) expect(within(rowOf(o.name)).getByRole('button', { name: 'Log' })).toBeInTheDocument()
    const d = await openLogFor('Martinez Tile & Bath')
    expect(within(d).getByRole('heading', { name: 'Log for Martinez Tile & Bath' })).toBeInTheDocument()
    expect(within(d).getByLabelText('About')).toHaveDisplayValue('Martinez Tile & Bath')
    expect(within(d).getByRole('button', { name: 'Phone call' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(d).getByLabelText('When')).toHaveValue(localYmd(new Date()))
    // Save waits for the one line.
    expect(within(d).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('a past call on a Considering option logs it and sets Contacted, with one Undo for both', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const d = await openLogFor('Martinez Tile & Bath')
    const yesterday = localYmd(dayFrom(-1))
    fireEvent.change(within(d).getByLabelText('When'), { target: { value: yesterday } })
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Can come Thursday')
    expect(within(d).queryByText(/That date is ahead/)).not.toBeInTheDocument()
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))

    expect(w.addLogEntry).toHaveBeenCalledWith({ goal, optionId: 'mar', kind: 'call', on: yesterday, summary: 'Can come Thursday' })
    expect(w.planEvent).not.toHaveBeenCalled()
    expect(w.updateOption).toHaveBeenCalledWith('mar', { status: 'contacted' })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0]).toBe('Log')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    w.updateOption.mockClear()
    await lastUndo()()
    expect(w.deleteLogEntry).toHaveBeenCalledWith('new')
    expect(w.updateOption).toHaveBeenCalledWith('mar', { status: 'considering' })
  })

  it('a visit dated tomorrow says it goes on the calendar, then plans it as a task', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const d = await openLogFor('Martinez Tile & Bath')
    await userEvent.click(within(d).getByRole('button', { name: 'Home visit' }))
    const tomorrow = dayFrom(1)
    fireEvent.change(within(d).getByLabelText('When'), { target: { value: localYmd(tomorrow) } })
    fireEvent.change(within(d).getByLabelText('Time'), { target: { value: '09:30' } })
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Walk through upstairs bath')
    const when = `${WEEKDAYS[tomorrow.getDay()]} ${MONTHS[tomorrow.getMonth()]} ${tomorrow.getDate()}`
    expect(within(d).getByText(`That date is ahead, so this goes on your calendar for ${when} at 9:30. It joins the log when you tick it done.`)).toBeInTheDocument()
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))

    expect(w.planEvent).toHaveBeenCalledWith({
      goal, goalContext: 'family', goalScope: 'compound', optionId: 'mar', optionName: 'Martinez Tile & Bath',
      kind: 'visit', on: localYmd(tomorrow), time: '09:30', summary: 'Walk through upstairs bath',
    })
    expect(w.addLogEntry).not.toHaveBeenCalled()
    expect(w.updateOption).toHaveBeenCalledWith('mar', { status: 'contacted' })
    await lastUndo()()
    expect(w.deleteTask).toHaveBeenCalledWith('tnew')
    expect(w.updateOption).toHaveBeenLastCalledWith('mar', { status: 'considering' })
  })

  it('when the status change fails, the new entry is taken back and the save fails', async () => {
    w.updateOption.mockResolvedValueOnce(false)
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const d = await openLogFor('Martinez Tile & Bath')
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Left a voicemail')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(w.deleteLogEntry).toHaveBeenCalledWith('new')
    expect(await run.mock.results[0].value).toBe(false)
    // Nothing was left behind, so the receipt's own "Nothing changed" is true.
    expect(run.mock.calls[0][2]).not.toHaveProperty('failureSummary')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('when the status change throws and the entry cannot be taken back, the receipt says what stayed', async () => {
    w.updateOption.mockRejectedValueOnce(new Error('offline'))
    w.deleteLogEntry.mockResolvedValueOnce(false)
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const d = await openLogFor('Martinez Tile & Bath')
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Left a voicemail')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(w.deleteLogEntry).toHaveBeenCalledWith('new')
    expect(await run.mock.results[0].value).toBe(false)
    expect(run.mock.calls[0][2]).toMatchObject({ failureState: 'partial', failureSummary: "Logged, but the status didn't change." })
  })

  it('logging on a Heard back option leaves its status alone', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const d = await openLogFor('Chesapeake Renovations')
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Asked about tile')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(w.addLogEntry).toHaveBeenCalledWith(expect.objectContaining({ optionId: 'che', kind: 'call' }))
    expect(w.updateOption).not.toHaveBeenCalled()
  })

  it('a note on a Considering option is not a contact', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const d = await openLogFor('Martinez Tile & Bath')
    await userEvent.click(within(d).getByRole('button', { name: 'Note' }))
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Saw their van')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(w.addLogEntry).toHaveBeenCalledWith(expect.objectContaining({ optionId: 'mar', kind: 'note' }))
    expect(w.updateOption).not.toHaveBeenCalled()
  })

  it('the row shows the next planned event and the last one done', () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    // Stacked: the next planned event, then the last one done.
    const line = (text: string) => within(rowOf('Scher Remodeling')).getByText((_, el) => el?.tagName === 'SPAN' && el.classList.contains('block') && el.textContent === text)
    expect(line('Home visit Fri Oct 30, 10:00')).toHaveClass('text-primary-600')
    expect(line('last: Phone call Oct 22')).toBeInTheDocument()
    expect(rowOf('Martinez Tile & Bath').textContent).not.toContain('last:')
  })

  it('the Log section lists Coming up and Done, and + Log opens the dialog about the project', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    expect(screen.getByRole('heading', { name: 'Log' })).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'Log' })
    expect(within(section).getByText('Coming up')).toBeInTheDocument()
    expect(within(section).getByText('Done')).toBeInTheDocument()
    const lines = within(section).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines[0]).toContain('Fri Oct 30')
    expect(lines[0]).toContain('Scher Remodeling · 10:00 · Walk through upstairs bath')
    expect(lines[0]).toContain('on your calendar')
    expect(lines[1]).toContain('Oct 22')
    expect(lines[1]).toContain('Scher Remodeling · Can come Thursday')
    expect(lines[1]).toContain('Scott')
    expect(lines[2]).toContain('The project · Iris wants to keep the clawfoot tub')
    expect(lines[2]).toContain('Iris')

    await userEvent.click(within(section).getByRole('button', { name: '+ Log' }))
    const d = dialog()
    expect(within(d).getByRole('heading', { name: 'Log' })).toBeInTheDocument()
    expect(within(d).getByLabelText('About')).toHaveDisplayValue('The project (no one contractor)')
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Permit office called')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(w.addLogEntry).toHaveBeenCalledWith(expect.not.objectContaining({ optionId: expect.anything() }))
    expect(w.updateOption).not.toHaveBeenCalled()
  })

  it('shows the latest 10 done lines, with All N to see the rest', async () => {
    const many = Array.from({ length: 12 }, (_, i) => entry({ id: `m${i}`, on: `2026-10-${String(i + 1).padStart(2, '0')}`, summary: `Line ${i + 1}` }))
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog(many, [visit])} />)
    const section = screen.getByRole('region', { name: 'Log' })
    expect(within(section).getAllByRole('listitem')).toHaveLength(11)
    expect(within(section).queryByText(/Line 2$/)).not.toBeInTheDocument()
    // The count is of the done lines (the ones the limit trims).
    await userEvent.click(within(section).getByRole('button', { name: 'All 12' }))
    expect(within(section).getAllByRole('listitem')).toHaveLength(13)
  })

  it('an entry is deleted from its ⋯ after a confirm; Undo logs it again', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const section = screen.getByRole('region', { name: 'Log' })
    const line = within(section).getByText(/Iris wants to keep/).closest('li') as HTMLElement
    await userEvent.click(within(line).getByRole('button', { name: 'Entry actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(w.deleteLogEntry).not.toHaveBeenCalled()
    await userEvent.click(within(section).getByRole('button', { name: 'Delete' }))
    expect(w.deleteLogEntry).toHaveBeenCalledWith('e2')
    await lastUndo()()
    expect(w.addLogEntry).toHaveBeenCalledWith({ goal, kind: 'note', on: '2026-10-20', summary: 'Iris wants to keep the clawfoot tub' })
  })

  it('an entry is edited from its ⋯; Undo puts the old fields back', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const section = screen.getByRole('region', { name: 'Log' })
    const line = within(section).getByText(/Can come Thursday/).closest('li') as HTMLElement
    await userEvent.click(within(line).getByRole('button', { name: 'Entry actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const d = dialog()
    // What it is about stays; to change it, delete and log again.
    expect(within(d).queryByLabelText('About')).not.toBeInTheDocument()
    const field = within(d).getByLabelText("What happened, or what it's for")
    expect(field).toHaveValue('Can come Thursday')
    await userEvent.clear(field)
    await userEvent.type(field, 'Can come Friday')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(w.updateLogEntry).toHaveBeenCalledWith('e1', { kind: 'call', on: '2026-10-22', time: null, summary: 'Can come Friday' })
    await lastUndo()()
    expect(w.updateLogEntry).toHaveBeenLastCalledWith('e1', { kind: 'call', on: '2026-10-22', time: null, summary: 'Can come Thursday' })
  })

  it('a planned line opens its task, where tasks are edited', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const section = screen.getByRole('region', { name: 'Log' })
    await userEvent.click(within(section).getByRole('button', { name: /Walk through upstairs bath/ }))
    expect(navigate).toHaveBeenCalledWith('/today?detail=task:t1')
  })

  it('editing an entry about another choice\'s option titles the dialog with its name', async () => {
    const other = entry({ id: 'e9', optionId: 'x9', summary: 'Called about grout' })
    render(<ChoicePageView detail={detail} writers={w}
      goalLog={{ ...pageLog([other], []), optionNames: new Map([['x9', 'Harbor Bath']]) }} />)
    const section = screen.getByRole('region', { name: 'Log' })
    expect(within(section).getByText(/Harbor Bath · Called about grout/)).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: 'Entry actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(within(dialog()).getByRole('heading', { name: 'Log for Harbor Bath' })).toBeInTheDocument()
  })

  it('the table keeps a row\'s verbs on one line', () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    const verbs = within(rowOf('Scher Remodeling')).getByRole('button', { name: 'Log' }).parentElement as HTMLElement
    expect(verbs).toHaveClass('flex-nowrap')
  })

  it('⋯ History shows the log for that option only', async () => {
    render(<ChoicePageView detail={detail} writers={w} goalLog={pageLog()} />)
    await userEvent.click(within(rowOf('Scher Remodeling')).getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'History' }))
    const d = dialog()
    expect(within(d).getByRole('heading', { name: 'History · Scher Remodeling' })).toBeInTheDocument()
    expect(within(d).getByText(/Can come Thursday/)).toBeInTheDocument()
    expect(within(d).queryByText(/clawfoot/)).not.toBeInTheDocument()
  })
})
