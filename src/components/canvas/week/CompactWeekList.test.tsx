import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CompactWeekList, type CompactRow } from './CompactWeekList'
import { groupByParent, dayWordFor } from './compactWeek'

const trip = { id: 'm1', title: 'Plan the autumn trip' }
const paper = { id: 'm2', title: 'Get the paperwork in order' }
const row = (key: string, x: Partial<CompactRow<string>> = {}): CompactRow<string> => ({ key, id: key, title: `Row ${key}`, item: key, ...x })

describe('groupByParent', () => {
  it('orders groups by first appearance, keeps row order, and puts Unlinked last', () => {
    const g = groupByParent([row('a'), row('b', { parent: trip }), row('c', { parent: paper }), row('d', { parent: trip })])
    expect(g.map((x) => x.parent?.id ?? 'unlinked')).toEqual(['m1', 'm2', 'unlinked'])
    expect(g[0].rows.map((r) => r.key)).toEqual(['b', 'd'])
  })
})

describe('dayWordFor', () => {
  it('says today for today, the weekday otherwise', () => {
    const now = new Date(2026, 9, 10, 9)
    expect(dayWordFor(new Date(2026, 9, 10), now)).toEqual({ word: 'today', tag: 'Today' })
    expect(dayWordFor(new Date(2026, 9, 9), now).tag).toBe('Friday')
  })
})

describe('CompactWeekList', () => {
  const rows = [
    row('a', { parent: trip }), row('b', { parent: paper }), row('c', { parent: trip }), row('d'),
  ]

  it('writes a parent with two or more rows once as a header; a lone row carries it as a suffix; the rest are Unlinked', () => {
    render(<CompactWeekList rows={rows} label="Week" />)
    const group = screen.getByRole('region', { name: 'Plan the autumn trip' })
    expect(within(group).getByText('Row a')).toBeInTheDocument()
    expect(within(group).getByText('Row c')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Get the paperwork in order' })).toBeNull()
    expect(screen.getByText('Row b').closest('li')).toHaveTextContent('Get the paperwork in order')
    const unlinked = screen.getByRole('region', { name: 'Unlinked' })
    expect(unlinked).toHaveClass('is-unlinked')
    expect(within(unlinked).getByText('Row d')).toBeInTheDocument()
  })

  it('draws no Unlinked header when nothing is linked', () => {
    render(<CompactWeekList rows={[row('a'), row('b')]} label="Week" />)
    expect(screen.queryByRole('region', { name: 'Unlinked' })).toBeNull()
    expect(screen.getByText('Row a')).toBeInTheDocument()
  })

  it('keeps a row already on the day in its group, tagged, without an add button', () => {
    const onAdd = vi.fn()
    render(<CompactWeekList rows={[row('a', { parent: trip, onDay: 'Today 2p' }), row('c', { parent: trip })]} label="Week" onAdd={onAdd} />)
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
