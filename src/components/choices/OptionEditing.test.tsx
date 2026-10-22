import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { Choice, ChoiceOption, PriceLine, CellValue } from '@/types/choice'
import type { ChoiceDetail } from '@/lib/choices/db'

type Undo = { undo?: () => Promise<unknown> }
const { run } = vi.hoisted(() => ({
  run: vi.fn(async (_label: string, command: () => Promise<unknown>, _opts?: Undo) => (await command()) !== false),
}))
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ run }) }))

import { ChoicePageView, type ChoicePageWriters } from './ChoicePage'
import { splitPhone } from './cells'

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

function makeWriters() {
  return {
    setSelectedWork: vi.fn(async () => true),
    updateChoice: vi.fn(async () => true),
    addOption: vi.fn(async (input: { name: string; contactId?: string }) => opt('new', input.name, 9, { contactId: input.contactId })),
    updateOption: vi.fn(async () => true),
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
  } satisfies ChoicePageWriters
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
    expect(w.addContact).toHaveBeenCalledWith({ name: 'Martinez Tile', phone: '410-555-0142' })
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
})

describe('splitPhone', () => {
  it('splits a name from a phone wherever the phone sits', () => {
    expect(splitPhone('Martinez Tile 410-555-0142')).toEqual({ name: 'Martinez Tile', phone: '410-555-0142' })
    expect(splitPhone('(410) 555-0119 - Rob')).toEqual({ name: 'Rob', phone: '(410) 555-0119' })
    expect(splitPhone('410.555.0187')).toEqual({ name: '410.555.0187', phone: '410.555.0187' })
    expect(splitPhone('  Harbor Bath  ')).toEqual({ name: 'Harbor Bath' })
  })
})
