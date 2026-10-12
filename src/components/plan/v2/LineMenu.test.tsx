// Scott, 2026-09-29: on the Year page (a two-column list) the ⋯ menu split
// across the columns. It now renders outside the list, pinned to its button.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LineMenu, type LineActions, type LineVM } from './PlanLine'
import type { Task } from '@/types/task'

const task = { id: 't1', title: 'money tons of money', completed: false, isGoal: true, createdAt: new Date() } as unknown as Task
const vm = { task, fate: 'open', partOf: null, where: null } as unknown as LineVM
const actions = { done: vi.fn(), carry: vi.fn(), drop: vi.fn(), details: vi.fn() } as unknown as LineActions

describe('LineMenu', () => {
  it('opens outside the list it sits in, so columns can’t split it', () => {
    render(<ul className="pv2-brain"><li><LineMenu vm={vm} actions={actions} nextLabel="2027" /></li></ul>)
    fireEvent.click(screen.getByRole('button', { name: 'More for money tons of money' }))
    const menu = screen.getByRole('menu')
    expect(menu.closest('ul')).toBeNull()
    expect(menu.parentElement).toBe(document.body)
    expect(screen.getByRole('menuitem', { name: /Carry to 2027/ })).toBeTruthy()
  })

  it('closes on an outside click, and a pick runs its action', () => {
    render(<LineMenu vm={vm} actions={actions} nextLabel="2027" />)
    fireEvent.click(screen.getByRole('button', { name: /More for/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Drop it/ }))
    expect(actions.drop).toHaveBeenCalledWith(task)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /More for/ }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  // The triage contract on the week's planning rows (2026-10-12): When… opens
  // the same When group every task surface shows; its Someday and Today stand
  // in for the menu's own.
  it('a week row’s When… offers the contract’s When and routes the pick', () => {
    const pick = vi.fn()
    const weekTask = { ...task, isGoal: false } as Task
    const a = { ...actions, someday: vi.fn(), today: vi.fn(), when: { pick } } as unknown as LineActions
    render(<LineMenu vm={{ ...vm, task: weekTask }} actions={a} nextLabel="next week" />)
    fireEvent.click(screen.getByRole('button', { name: /More for/ }))
    expect(screen.queryByRole('menuitem', { name: /Do it today/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /^Someday$/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Complete/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /When…/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Tomorrow/ }))
    expect(pick).toHaveBeenCalledWith(weekTask, 'tomorrow')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
