import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CompactWeekList, type CompactRow } from './CompactWeekList'
import { dayWordFor } from './compactWeek'

const row = (key: string, x: Partial<CompactRow<string>> = {}): CompactRow<string> => ({ key, id: key, title: `Row ${key}`, item: key, ...x })

describe('dayWordFor', () => {
  it('says today for today, the weekday otherwise', () => {
    const now = new Date(2026, 9, 10, 9)
    expect(dayWordFor(new Date(2026, 9, 10), now)).toEqual({ word: 'today', tag: 'Today' })
    expect(dayWordFor(new Date(2026, 9, 9), now).tag).toBe('Friday')
  })
})

describe('CompactWeekList', () => {
  // Paper-style horizons (spec 2026-11-04): Week and Today show the week
  // flat, in its own order: no group headings, no parent, no serves line.
  it('draws the rows flat, in order, with no group heading or parent', () => {
    // Rows that once carried a parent (a month line) draw flat all the same.
    const trip = { parent: { id: 'm1', title: 'Plan the autumn trip' } } as never
    render(<CompactWeekList rows={[row('a', trip), row('b'), row('c', trip), row('d')]} label="Week" />)
    const list = screen.getByRole('group', { name: 'Week' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Row a', 'Row b', 'Row c', 'Row d'])
    expect(within(list).queryAllByRole('region')).toEqual([])
    expect(screen.queryByText('Plan the autumn trip')).toBeNull()
    expect(list.querySelector('.canvas-group, .cw-parent, .serves-line, .today-serves')).toBeNull()
  })

  it('keeps a row already on the day in its place, tagged, without an add button', () => {
    const onAdd = vi.fn()
    render(<CompactWeekList rows={[row('a', { onDay: 'Today 2p' }), row('c')]} label="Week" onAdd={onAdd} />)
    const li = screen.getByText('Row a').closest('li')!
    expect(li).toHaveClass('is-on-today')
    expect(within(li).getByText('Today 2p')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Row a to today' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Row c to today' }))
    expect(onAdd).toHaveBeenCalledWith('c', expect.anything())
  })

  it('hides done rows until “Show done” is pressed', () => {
    render(<CompactWeekList rows={[row('a'), row('z', { completed: true })]} label="Week" onComplete={vi.fn()} />)
    expect(screen.queryByText('Row z')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show done' }))
    expect(screen.getByText('Row z')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Row z not done' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide done' }))
    expect(screen.queryByText('Row z')).toBeNull()
  })

  it('read-only rows open but neither drag, check nor add', () => {
    const onOpen = vi.fn()
    render(<CompactWeekList rows={[row('a', { readOnly: true })]} label="Next" onOpen={onOpen} onAdd={vi.fn()} onComplete={vi.fn()} onDragStart={vi.fn()} />)
    const li = screen.getByText('Row a').closest('li')!
    expect(li).toHaveAttribute('draggable', 'false')
    expect(within(li).queryAllByRole('button').map((b) => b.textContent)).toEqual(['Row a'])
    fireEvent.click(screen.getByRole('button', { name: 'Row a' }))
    expect(onOpen).toHaveBeenCalledWith('a')
  })
})
