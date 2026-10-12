// The one triage menu: a ⋯ trigger opening the contract (lib/triage/contract)
// for the thing in hand — surface verbs, When (the shared grid), the scoped
// Skip, then More in the contract's order.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TaskFateMenu } from './TaskFateMenu'

function open(name = 'Task actions') {
  fireEvent.click(screen.getByRole('button', { name }))
}
const items = () => screen.getAllByRole('menuitem').map((b) => b.textContent ?? '')

describe('TaskFateMenu', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 12, 9, 0)) }) // Mon Oct 12
  afterEach(() => { vi.useRealTimers() })

  it('a task: When (Tomorrow named with its date), then More in contract order', () => {
    render(<TaskFateMenu onPickWhen={vi.fn()} onPickDate={vi.fn()} onComplete={vi.fn()} onOpen={vi.fn()} onPeople={vi.fn()} onArea={vi.fn()} onMoveUnder={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    open()
    const when = within(screen.getByRole('group', { name: 'When' }))
    expect(when.getByRole('menuitem', { name: /Tomorrow\s*Tue, Oct 13/ })).toBeInTheDocument()
    const more = within(screen.getByRole('group', { name: 'More' })).getAllByRole('menuitem').map((b) => b.textContent)
    expect(more).toEqual(['Complete', 'Open details', 'People…', 'Life area…', 'Move under…', 'Delete'])
  })

  it('routes a when pick and closes', () => {
    const onPickWhen = vi.fn()
    render(<TaskFateMenu onPickWhen={onPickWhen} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Someday/ }))
    expect(onPickWhen).toHaveBeenCalledWith('someday')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('a dated task carries "Skip this day", saying what it keeps', () => {
    const onSkip = vi.fn()
    render(<TaskFateMenu entity="dated-task" onPickWhen={vi.fn()} onSkip={onSkip} />)
    open()
    expect(screen.getByText(/The task, its week and its goal stay/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Skip this day' }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('a routine occurrence: a period asks for a real day — never a silent Saturday', () => {
    const onPickWhen = vi.fn()
    render(<TaskFateMenu entity="occurrence" onPickWhen={onPickWhen} onSkip={vi.fn()} onOpen={vi.fn()} />)
    open()
    // Both weekend days are offered as themselves.
    expect(screen.getByRole('menuitem', { name: /This weekend\s*Sat, Oct 17/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /This weekend\s*Sun, Oct 18/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Next week(?!end)/ }))
    expect(onPickWhen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: /Wed, Oct 21/ }))
    expect(onPickWhen).toHaveBeenCalledWith('next-week', new Date(2026, 9, 21))
  })

  it('an occurrence’s Someday explains itself and offers Skip this time / Open routine — no silent no-op', () => {
    const onSkip = vi.fn()
    const onPickWhen = vi.fn()
    render(<TaskFateMenu entity="occurrence" onPickWhen={onPickWhen} onSkip={onSkip} onOpen={vi.fn()} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Someday/ }))
    expect(onPickWhen).not.toHaveBeenCalled()
    expect(screen.getByRole('note')).toHaveTextContent('Someday isn’t available for one time of a routine')
    // The scoped alternatives are right there in the same menu.
    expect(screen.getByRole('menuitem', { name: 'Open routine' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Skip this time' }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('an occurrence never offers People or Life area (they belong to the whole routine)', () => {
    render(<TaskFateMenu entity="occurrence" onPickWhen={vi.fn()} onComplete={vi.fn()} onOpen={vi.fn()} onPeople={vi.fn()} onArea={vi.fn()} />)
    open()
    expect(within(screen.getByRole('group', { name: 'More' })).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Complete', 'Open routine'])
  })

  it('a goal is offered no days — only its own verbs', () => {
    render(<TaskFateMenu entity="period-goal" label="Actions for Fall goal" onPickWhen={vi.fn()} onComplete={vi.fn()}
      extras={[{ label: 'Carry to next month · November', onSelect: vi.fn() }]} />)
    open('Actions for Fall goal')
    expect(items().some((t) => /Today|Tomorrow|Pick date/.test(t))).toBe(false)
    expect(items().some((t) => t.includes('Carry to next month · November'))).toBe(true)
  })

  it('surface verbs come first', () => {
    const onOpen = vi.fn()
    const bringForward = vi.fn()
    render(<TaskFateMenu onPickWhen={vi.fn()} onOpen={onOpen} extras={[{ label: 'Bring to this week', onSelect: bringForward }]} />)
    open()
    expect(items()[0]).toMatch(/Bring to this week/)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bring to this week' }))
    expect(bringForward).toHaveBeenCalled()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open details' }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('File under a pick lists picks with their goal and fires onFile', () => {
    const onFile = vi.fn()
    render(<TaskFateMenu onPickWhen={vi.fn()} fileUnder={{ picks: [{ id: 'p1', title: 'Porch set up', goalName: 'A calmer home' }], onFile }} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File under a pick' }))
    expect(screen.getByText('serves A calmer home')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Porch set up/ }))
    expect(onFile).toHaveBeenCalledWith('p1')
  })

  it('keyboard: opens on the first item, arrows move, Escape closes back to ⋯', () => {
    render(<TaskFateMenu onPickWhen={vi.fn()} onComplete={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Task actions' })
    fireEvent.click(trigger)
    const first = screen.getAllByRole('menuitem')[0]
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[1])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on outside mousedown', () => {
    render(<TaskFateMenu onPickWhen={vi.fn()} onOpen={vi.fn()} />)
    open()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
