import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, fireEvent, renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { Choice, ChoiceColumn, ChoiceOption, PriceLine, CellValue, WorkPiece } from '@/types/choice'
import type { ChoiceDetail } from '@/lib/choices/db'

type Undo = { undo?: () => Promise<unknown> }
const { run } = vi.hoisted(() => ({
  run: vi.fn(async (_label: string, command: () => Promise<unknown>, _opts?: Undo) => (await command()) !== false),
}))
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ run }) }))
const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

import { ChoicePageView, type ChoicePageWriters } from './ChoicePage'
import { splitPhone } from './cells'
import { useChoiceEditing } from './useChoiceEditing'

const now = new Date()
const choice: Choice = {
  id: 'c1', userId: 'u', goal: { kind: 'task', id: 'g1' }, title: 'Contractor', status: 'open',
  decidedWork: [], sortOrder: 0, createdAt: now, updatedAt: now,
  columns: [
    { id: 'start', label: 'Earliest start', kind: 'date' },
    { id: 'bid', label: 'Bid', kind: 'money' },
  ],
  work: [
    { id: 'main', label: 'Main bath' },
    { id: 'hall', label: 'Hall bath' },
    { id: 'kids', label: "Kids' bath" },
  ],
  selectedWork: ['main', 'hall'],
}
const opt = (id: string, name: string, order: number, o: Partial<ChoiceOption> = {}, values: Record<string, CellValue> = {}): ChoiceOption => ({
  id, choiceId: 'c1', userId: 'u', name, status: 'heard_back', statusChangedAt: new Date(2026, 9, 18),
  values, sortOrder: order, updatedAt: now, ...o,
})
const line = (id: string, optionId: string, workIds: string[], amountCents: number): PriceLine =>
  ({ id, optionId, workIds, amountCents, sortOrder: 0 })

const detail: ChoiceDetail = {
  choice, goalTitle: 'Redo the bathrooms', goalContext: 'family', goalScope: 'compound',
  options: [
    opt('mar', 'Martinez Tile & Bath', 1, { status: 'considering' }, { start: '2026-11-17' }),
    opt('che', 'Chesapeake Renovations', 2, {}, { start: '2026-12-01' }),
    opt('rob', "Rob (Dave's cousin)", 3, { status: 'contacted' }),
  ],
  lines: [line('l1', 'mar', ['main'], 1840000), line('l2', 'mar', ['gone'], 500000)],
  followUps: [],
  contacts: new Map(),
}

/** Writers over an in-memory copy of the rows, so each write's fresh read
 *  sees what the writes before it (or another device) left. */
function makeWriters(start: ChoiceDetail = detail) {
  const server = {
    lists: { columns: start.choice.columns, work: start.choice.work, selectedWork: start.choice.selectedWork },
    values: new Map(start.options.map((o) => [o.id, o.values])),
  }
  return {
    server,
    readChoice: vi.fn(async () => ({ ...server.lists })),
    readOptionValues: vi.fn(async (id: string) => server.values.get(id) ?? null),
    setSelectedWork: vi.fn(async (ids: string[]) => { server.lists = { ...server.lists, selectedWork: ids }; return true }),
    updateChoice: vi.fn(async (patch: { title?: string; columns?: ChoiceColumn[]; work?: WorkPiece[]; selected_work?: string[] }) => {
      server.lists = {
        columns: patch.columns ?? server.lists.columns,
        work: patch.work ?? server.lists.work,
        selectedWork: patch.selected_work ?? server.lists.selectedWork,
      }
      return true
    }),
    deleteChoice: vi.fn(async () => true),
    addOption: vi.fn(async (input: { name: string; contactId?: string }) => opt('new', input.name, 9, { contactId: input.contactId })),
    updateOption: vi.fn(async (id: string, patch: { values?: Record<string, CellValue> }) => {
      if (patch.values) server.values.set(id, patch.values)
      return true
    }),
    deleteOption: vi.fn(async () => true),
    addPriceLine: vi.fn(async (optionId: string, input: { workIds: string[]; amountCents: number; note?: string }) =>
      ({ id: 'nl', optionId, ...input, sortOrder: 0 })),
    updatePriceLine: vi.fn(async () => true),
    deletePriceLine: vi.fn(async () => true),
    createFollowUp: vi.fn(async () => 't9'),
    deleteTask: vi.fn(async () => true),
    chooseOption: vi.fn(async () => true),
    reopenChoice: vi.fn(async () => true),
    addContact: vi.fn(async () => ({ id: 'k9' })),
    deleteContact: vi.fn(async () => true),
    addLogEntry: vi.fn(async () => null),
    updateLogEntry: vi.fn(async () => true),
    deleteLogEntry: vi.fn(async () => true),
    planEvent: vi.fn(async () => null),
  } satisfies ChoicePageWriters & { server: unknown }
}
let w: ReturnType<typeof makeWriters>

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

/** Every write the page ran was offered an Undo. */
function expectUndoOnEveryRun(count: number) {
  expect(run).toHaveBeenCalledTimes(count)
  for (const call of run.mock.calls) expect(typeof call[2]?.undo).toBe('function')
}
const lastUndo = () => run.mock.calls[run.mock.calls.length - 1][2]!.undo!

function setWide() {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

describe('editing on the comparison page', () => {
  beforeEach(() => { setWide(); run.mockClear(); w = makeWriters() })

  it('pasting a name and phone adds a contact and an option linked to it', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByPlaceholderText('Add an option: a name, or paste a phone number'))
    await userEvent.paste('Martinez Tile 410-555-0142')
    await userEvent.keyboard('{Enter}')
    // The contact takes the goal's domain (here Family), so both partners see it.
    expect(w.addContact).toHaveBeenCalledWith({ name: 'Martinez Tile', phone: '410-555-0142', context: 'family' })
    expect(w.addOption).toHaveBeenCalledWith({ name: 'Martinez Tile', contactId: 'k9' })
    expectUndoOnEveryRun(1)
    await lastUndo()()
    expect(w.deleteOption).toHaveBeenCalledWith('new')
    expect(w.deleteContact).toHaveBeenCalledWith('k9')
  })

  it('a plain name adds an option with no contact', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.type(screen.getByPlaceholderText('Add an option: a name, or paste a phone number'), 'Harbor Bath{Enter}')
    expect(w.addContact).not.toHaveBeenCalled()
    expect(w.addOption).toHaveBeenCalledWith({ name: 'Harbor Bath' })
  })

  it('the Add button adds the typed option, and is disabled while the box is empty', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    const add = screen.getByRole('button', { name: 'Add option' })
    expect(add).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText('Add an option: a name, or paste a phone number'), 'Scher')
    await userEvent.click(add)
    expect(w.addOption).toHaveBeenCalledWith({ name: 'Scher' })
  })

  it('an empty choice says where to add the first option', () => {
    render(<ChoicePageView detail={{ ...detail, options: [], lines: [] }} writers={w} />)
    expect(screen.getByText('No options yet. Type a name below and press Add.')).toBeInTheDocument()
  })

  it('empty cells say what tapping them does', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    const row = rowOf('Chesapeake Renovations')
    expect(within(row).getByRole('button', { name: 'Price for Chesapeake Renovations' })).toHaveTextContent('Add price')
    const bid = within(row).getByRole('button', { name: 'Bid for Chesapeake Renovations' })
    expect(bid).toHaveTextContent('Add')
    await userEvent.click(bid)
    expect(within(row).getByRole('textbox', { name: 'Bid' })).toBeInTheDocument()
  })

  it('setting Contacted offers a follow-up, and the date creates it', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(within(rowOf('Martinez Tile & Bath')).getByRole('button', { name: 'Status ▾' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Contacted' }))
    expect(w.updateOption).toHaveBeenCalledWith('mar', { status: 'contacted' })
    const date = screen.getByLabelText('Follow up on')
    fireEvent.change(date, { target: { value: '2026-10-27' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(w.createFollowUp).toHaveBeenCalledWith(detail, detail.options[0], new Date(2026, 9, 27))
    expectUndoOnEveryRun(2)
    await lastUndo()()
    expect(w.deleteTask).toHaveBeenCalledWith('t9')
  })

  it('the follow-up date defaults to three days out', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(within(rowOf("Rob (Dave's cousin)")).getByRole('button', { name: 'Follow up on…' }))
    const d = new Date(); d.setDate(d.getDate() + 3)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(screen.getByLabelText('Follow up on')).toHaveValue(iso)
  })

  it('a money cell saves cents, and a bad entry shows the hint without a write', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bid for Chesapeake Renovations' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Bid' }), '$19,750{Enter}')
    expect(w.updateOption).toHaveBeenCalledWith('che', { values: { start: '2026-12-01', bid: 1975000 } })
    expectUndoOnEveryRun(1)
    await lastUndo()()
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { values: { start: '2026-12-01' } })

    await userEvent.click(screen.getByRole('button', { name: 'Bid for Martinez Tile & Bath' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Bid' }), 'abc{Enter}')
    expect(screen.getByText('Use a number, like 19,750')).toBeInTheDocument()
    expect(w.updateOption).toHaveBeenCalledTimes(2)
  })

  it('a new price line saves its pieces and amount', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: "Price for Rob (Dave's cousin)" }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Line' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Hall bath' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Main bath' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Amount' }), '27000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add line' }))
    expect(w.addPriceLine).toHaveBeenCalledWith('rob', { workIds: ['main', 'hall'], amountCents: 2700000 })
    expectUndoOnEveryRun(1)
    await lastUndo()()
    expect(w.deletePriceLine).toHaveBeenCalledWith('nl')
  })

  it('an existing line names a removed piece', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Price for Martinez Tile & Bath' }))
    expect(within(screen.getByRole('dialog')).getByText('Removed piece')).toBeInTheDocument()
  })

  it('Choose with a reason calls chooseOption with it', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(within(rowOf('Chesapeake Renovations')).getByRole('button', { name: 'Choose this' }))
    await userEvent.type(screen.getByLabelText('Why (in your words)'), 'Earliest start')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(w.chooseOption).toHaveBeenCalledWith(detail, 'che', 'Earliest start', expect.any(Date))
    expectUndoOnEveryRun(1)
  })

  it('a decided choice shows the banner, read-only, and Reopen calls reopenChoice', async () => {
    const decided: ChoiceDetail = {
      ...detail,
      choice: { ...choice, status: 'decided', chosenOptionId: 'che', decidedAt: new Date(2026, 9, 30), decidedNote: 'Earliest start' },
      options: detail.options.map((o) => o.id === 'che' ? { ...o, status: 'chosen' } : o),
    }
    render(<ChoicePageView detail={decided} writers={w} />)
    expect(screen.getByText('Chose Chesapeake Renovations')).toBeInTheDocument()
    expect(screen.getByText('“Earliest start”')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose this' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Add an option/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bid for Chesapeake Renovations' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(w.reopenChoice).toHaveBeenCalledWith(decided)
    expectUndoOnEveryRun(1)
  })

  it('+ Column adds a named column of the picked kind', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: '+ Column' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Column name' }), 'Warranty')
    await userEvent.click(screen.getByRole('button', { name: 'Yes/no' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(w.updateChoice).toHaveBeenCalledWith({
      columns: [...choice.columns, { id: expect.any(String), label: 'Warranty', kind: 'yesno' }],
    })
    expectUndoOnEveryRun(1)
  })

  it('removing a column keeps the values and stops showing it', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bid options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(w.updateChoice).toHaveBeenCalledWith({ columns: [choice.columns[0]] })
    expect(w.updateOption).not.toHaveBeenCalled()
  })

  it('removing a piece in Edit the work also unselects it', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit the work' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Hall bath' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(w.updateChoice).toHaveBeenCalledWith({
      work: [choice.work[0], choice.work[2]],
      selected_work: ['main'],
    })
    expectUndoOnEveryRun(1)
  })

  it('deleting an option asks first', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(within(rowOf('Chesapeake Renovations')).getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete option' }))
    expect(w.deleteOption).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(w.deleteOption).toHaveBeenCalledWith('che')
    expectUndoOnEveryRun(1)
  })

  it('quick work toggles build on each other before the page refetches', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: "Kids' bath" }))
    await userEvent.click(screen.getByRole('button', { name: 'Hall bath' }))
    expect(w.setSelectedWork).toHaveBeenNthCalledWith(1, ['main', 'hall', 'kids'])
    expect(w.setSelectedWork).toHaveBeenNthCalledWith(2, ['main', 'kids'])
  })

  it('on a card, Edit shows every fact to fill in', async () => {
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    render(<ChoicePageView detail={detail} writers={w} />)
    const rob = screen.getByText("Rob (Dave's cousin)").closest('li') as HTMLElement
    expect(within(rob).queryByText('Bid')).not.toBeInTheDocument()
    await userEvent.click(within(rob).getByRole('button', { name: 'Edit' }))
    await userEvent.click(within(rob).getByRole('button', { name: "Bid for Rob (Dave's cousin)" }))
    await userEvent.type(within(rob).getByRole('textbox', { name: 'Bid' }), '12,000{Enter}')
    expect(w.updateOption).toHaveBeenCalledWith('rob', { values: { bid: 1200000 } })
  })

  it('two quick edits on one row both land: the second builds on the first', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bid for Chesapeake Renovations' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Bid' }), '19750{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Earliest start for Chesapeake Renovations' }))
    fireEvent.change(within(rowOf('Chesapeake Renovations')).getByLabelText('Earliest start'), { target: { value: '2026-12-08' } })
    fireEvent.keyDown(within(rowOf('Chesapeake Renovations')).getByLabelText('Earliest start'), { key: 'Enter' })
    await vi.waitFor(() => expect(w.updateOption).toHaveBeenCalledTimes(2))
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { values: { start: '2026-12-08', bid: 1975000 } })
    // Undo of the second puts back exactly what it replaced, the first edit included.
    await lastUndo()()
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { values: { start: '2026-12-01', bid: 1975000 } })
  })

  it('double-tapping a yes/no goes Yes then No', async () => {
    const withIns: ChoiceDetail = { ...detail, choice: { ...choice, columns: [...choice.columns, { id: 'ins', label: 'Insured', kind: 'yesno' }] } }
    render(<ChoicePageView detail={withIns} writers={w} />)
    const cell = screen.getByRole('button', { name: 'Insured for Chesapeake Renovations' })
    await userEvent.click(cell)
    await userEvent.click(cell)
    expect(w.updateOption).toHaveBeenNthCalledWith(1, 'che', { values: { start: '2026-12-01', ins: true } })
    expect(w.updateOption).toHaveBeenNthCalledWith(2, 'che', { values: { start: '2026-12-01', ins: false } })
  })

  it('a failed edit is rolled back, so the next edit does not carry it', async () => {
    w.updateOption.mockResolvedValueOnce(false)
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bid for Chesapeake Renovations' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Bid' }), '19750{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Bid for Chesapeake Renovations' }))
    expect(screen.getByRole('textbox', { name: 'Bid' })).toHaveValue('')
    await userEvent.type(screen.getByRole('textbox', { name: 'Bid' }), '500{Enter}')
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { values: { start: '2026-12-01', bid: 50000 } })
  })

  it('quick ticks on an existing line build on each other, and undo restores the true previous pieces', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Price for Martinez Tile & Bath' }))
    const first = within(screen.getByRole('dialog')).getAllByRole('listitem')[0]
    await userEvent.click(within(first).getByRole('checkbox', { name: 'Hall bath' }))
    await userEvent.click(within(first).getByRole('checkbox', { name: "Kids' bath" }))
    expect(w.updatePriceLine).toHaveBeenNthCalledWith(1, 'l1', { work_ids: ['main', 'hall'] })
    expect(w.updatePriceLine).toHaveBeenNthCalledWith(2, 'l1', { work_ids: ['main', 'hall', 'kids'] })
    await lastUndo()()
    expect(w.updatePriceLine).toHaveBeenLastCalledWith('l1', { work_ids: ['main', 'hall'] })
  })

  it('unticking the last piece of a line is refused, not saved as no pieces', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Price for Martinez Tile & Bath' }))
    const first = within(screen.getByRole('dialog')).getAllByRole('listitem')[0]
    await userEvent.click(within(first).getByRole('checkbox', { name: 'Main bath' }))
    expect(w.updatePriceLine).not.toHaveBeenCalled()
    expect(within(first).getByText('Pick at least one piece')).toBeInTheDocument()
    expect(within(first).getByRole('checkbox', { name: 'Main bath' })).toBeChecked()
  })

  it('a decided choice cannot change the work', async () => {
    const decided: ChoiceDetail = { ...detail, choice: { ...choice, status: 'decided', chosenOptionId: 'che' } }
    render(<ChoicePageView detail={decided} writers={w} />)
    const kids = screen.getByRole('button', { name: "Kids' bath" })
    expect(kids).toBeDisabled()
    await userEvent.click(kids)
    expect(w.setSelectedWork).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Edit the work' })).not.toBeInTheDocument()
  })

  it('Rename and Notes in the ⋯ menu edit the option, with undo', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(within(rowOf('Chesapeake Renovations')).getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const name = screen.getByRole('textbox', { name: 'Option name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Chesapeake Reno{Enter}')
    expect(w.updateOption).toHaveBeenCalledWith('che', { name: 'Chesapeake Reno' })
    await lastUndo()()
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { name: 'Chesapeake Renovations' })

    await userEvent.click(within(rowOf('Chesapeake Renovations')).getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Notes' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'From Nextdoor')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { notes: 'From Nextdoor' })
    await lastUndo()()
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { notes: null })
    expectUndoOnEveryRun(2)
  })

  it('cards show the contact line', () => {
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    const withContact: ChoiceDetail = {
      ...detail,
      options: detail.options.map((o) => (o.id === 'mar' ? { ...o, contactId: 'k1' } : o)),
      contacts: new Map([['k1', { name: 'Luis', phone: '410-555-0142' }]]),
    }
    render(<ChoicePageView detail={withContact} writers={w} />)
    const card = screen.getByText('Martinez Tile & Bath').closest('li') as HTMLElement
    expect(within(card).getByText('Luis · 410-555-0142')).toBeInTheDocument()
  })
})

describe('a partner\'s edits made since the page loaded are kept', () => {
  beforeEach(() => { setWide(); run.mockClear(); w = makeWriters() })

  it('a value write lands on the option as it is now, and Undo takes back only that value', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    // Another device sets Chesapeake's bid after this page loaded.
    w.server.values.set('che', { start: '2026-12-01', bid: 1975000 })
    await userEvent.click(screen.getByRole('button', { name: 'Earliest start for Chesapeake Renovations' }))
    fireEvent.change(within(rowOf('Chesapeake Renovations')).getByLabelText('Earliest start'), { target: { value: '2026-12-08' } })
    fireEvent.keyDown(within(rowOf('Chesapeake Renovations')).getByLabelText('Earliest start'), { key: 'Enter' })
    await vi.waitFor(() => expect(w.updateOption).toHaveBeenCalledTimes(1))
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { values: { start: '2026-12-08', bid: 1975000 } })
    // Meanwhile the partner clears the bid; Undo puts back the date only.
    w.server.values.set('che', { start: '2026-12-08' })
    await act(async () => { await lastUndo()() })
    expect(w.updateOption).toHaveBeenLastCalledWith('che', { values: { start: '2026-12-01' } })
  })

  it('a column added, renamed or removed keeps a column the partner added', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    const theirs = { id: 'warranty', label: 'Warranty', kind: 'text' as const }
    w.server.lists = { ...w.server.lists, columns: [...choice.columns, theirs] }

    await userEvent.click(screen.getByRole('button', { name: 'Bid options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    await vi.waitFor(() => expect(w.updateChoice).toHaveBeenCalledTimes(1))
    expect(w.updateChoice).toHaveBeenLastCalledWith({ columns: [choice.columns[0], theirs] })
    await lastUndo()()
    // Back where it was, the partner's column still there.
    expect(w.updateChoice).toHaveBeenLastCalledWith({ columns: [choice.columns[0], choice.columns[1], theirs] })

    await userEvent.click(screen.getByRole('button', { name: '+ Column' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Column name' }), 'Permit')
    await userEvent.click(screen.getByRole('button', { name: 'Yes/no' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await vi.waitFor(() => expect(w.updateChoice).toHaveBeenCalledTimes(3))
    expect(w.updateChoice).toHaveBeenLastCalledWith({ columns: [...choice.columns, theirs, { id: expect.any(String), label: 'Permit', kind: 'yesno' }] })
    await lastUndo()()
    expect(w.updateChoice).toHaveBeenLastCalledWith({ columns: [...choice.columns, theirs] })
  })

  it('a work tick changes only that piece; the partner\'s ticks stay', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    w.server.lists = { ...w.server.lists, selectedWork: ['main', 'hall', 'kids'] }
    await userEvent.click(screen.getByRole('button', { name: 'Hall bath' }))
    await vi.waitFor(() => expect(w.setSelectedWork).toHaveBeenCalledTimes(1))
    expect(w.setSelectedWork).toHaveBeenLastCalledWith(['main', 'kids'])
    await lastUndo()()
    expect(w.setSelectedWork).toHaveBeenLastCalledWith(['main', 'hall', 'kids'])
  })

  it('Edit the work saves only what it changed, onto the work as it is now', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    const basement = { id: 'base', label: 'Basement' }
    w.server.lists = { ...w.server.lists, work: [...choice.work, basement], selectedWork: ['main', 'hall', 'base'] }
    await userEvent.click(screen.getByRole('button', { name: 'Edit the work' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getAllByRole('textbox', { name: 'Description' })[0], 'Gut it')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Hall bath' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(w.updateChoice).toHaveBeenCalledTimes(1))
    expect(w.updateChoice).toHaveBeenLastCalledWith({
      work: [{ id: 'main', label: 'Main bath', description: 'Gut it' }, choice.work[2], basement],
      selected_work: ['main', 'base'],
    })
    await lastUndo()()
    expect(w.updateChoice).toHaveBeenLastCalledWith({ work: [...choice.work, basement], selected_work: ['main', 'hall', 'base'] })
  })

  it('a piece a partner added while Edit the work was open is kept on save', async () => {
    const { rerender } = render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit the work' }))
    // The page refetches (focus) while the editor is open: a partner added Basement.
    const basement = { id: 'base', label: 'Basement' }
    w.server.lists = { ...w.server.lists, work: [...choice.work, basement] }
    rerender(<ChoicePageView detail={{ ...detail, choice: { ...choice, work: [...choice.work, basement] } }} writers={w} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('textbox', { name: 'Piece name' })).toHaveLength(3)
    await userEvent.type(within(dialog).getAllByRole('textbox', { name: 'Description' })[1], 'Tile only')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(w.updateChoice).toHaveBeenCalledTimes(1))
    expect(w.updateChoice).toHaveBeenLastCalledWith({
      work: [choice.work[0], { id: 'hall', label: 'Hall bath', description: 'Tile only' }, choice.work[2], basement],
      selected_work: ['main', 'hall'],
    })
  })

  it('a refused fresh read writes nothing', async () => {
    w.readOptionValues.mockResolvedValueOnce(null)
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bid for Chesapeake Renovations' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Bid' }), '19750{Enter}')
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(w.updateOption).not.toHaveBeenCalled()
    expect(await run.mock.results[0].value).toBe(false)
  })
})

describe('the choice itself: Rename and Delete', () => {
  beforeEach(() => { setWide(); run.mockClear(); navigate.mockClear(); w = makeWriters() })

  it('Rename in the heading ⋯ renames the choice, with undo', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Choice actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const name = screen.getByRole('textbox', { name: 'Choice name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Bathroom contractor{Enter}')
    expect(w.updateChoice).toHaveBeenCalledWith({ title: 'Bathroom contractor' })
    expectUndoOnEveryRun(1)
    await lastUndo()()
    expect(w.updateChoice).toHaveBeenLastCalledWith({ title: 'Contractor' })
  })

  it('Delete asks first, says it cannot be undone, then goes back', async () => {
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Choice actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete choice' }))
    expect(w.deleteChoice).not.toHaveBeenCalled()
    expect(screen.getByText("Delete Contractor? Its options, prices, values and their log go too. Can't be undone.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/Can't be undone/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Choice actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete choice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(w.deleteChoice).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('Delete choice', expect.any(Function))
    expect(navigate).toHaveBeenCalledWith('/today')
  })

  it('a failed delete stays on the page', async () => {
    w.deleteChoice.mockResolvedValueOnce(false)
    render(<ChoicePageView detail={detail} writers={w} />)
    await userEvent.click(screen.getByRole('button', { name: 'Choice actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete choice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByText(/Can't be undone/)).toBeInTheDocument()
  })
})

describe('choosing again (useChoiceEditing.choose on a decided choice)', () => {
  it('Undo chooses the earlier option again with its reason and date', async () => {
    run.mockClear()
    w = makeWriters()
    const decidedAt = new Date(2026, 9, 20)
    const decided: ChoiceDetail = {
      ...detail,
      choice: { ...choice, status: 'decided', chosenOptionId: 'mar', decidedAt, decidedNote: 'Earliest start' },
      options: detail.options.map((o) => (o.id === 'mar' ? { ...o, status: 'chosen' } : o)),
    }
    const { result } = renderHook(() => useChoiceEditing(decided, w))
    const che = decided.options.find((o) => o.id === 'che')!
    await act(async () => { await result.current.choose(che, 'Warranty') })
    expect(w.chooseOption).toHaveBeenCalledWith(decided, 'che', 'Warranty', expect.any(Date))
    await lastUndo()()
    const [after, id, note, at] = w.chooseOption.mock.calls[1] as unknown as [ChoiceDetail, string, string | null, Date]
    expect([id, note, at]).toEqual(['mar', 'Earliest start', decidedAt])
    expect(after.choice.chosenOptionId).toBe('che')
    expect(after.options.find((o) => o.id === 'che')!.status).toBe('chosen')
    expect(w.reopenChoice).not.toHaveBeenCalled()
    // Chesapeake was Heard back before: nothing more to put back.
    expect(w.updateOption).not.toHaveBeenCalled()
  })
})

describe('splitPhone', () => {
  it('splits a name from a phone wherever the phone sits', () => {
    expect(splitPhone('Martinez Tile 410-555-0142')).toEqual({ name: 'Martinez Tile', phone: '410-555-0142' })
    expect(splitPhone('(410) 555-0119 - Rob')).toEqual({ name: 'Rob', phone: '(410) 555-0119' })
    expect(splitPhone('410.555.0187')).toEqual({ name: '410.555.0187', phone: '410.555.0187' })
    expect(splitPhone('  Harbor Bath  ')).toEqual({ name: 'Harbor Bath' })
  })
})
