import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { BrainDump } from './BrainDump'

const AREAS = [{ id: 'h', name: 'Health' }, { id: 'm', name: 'Money' }]
const GOALS = [{ id: 'g1', title: 'Run a 10k', areaId: 'h' }, { id: 'g2', title: 'Fix the gate', areaId: null }]
const group = (name: string) => within(screen.getByRole('region', { name }))

describe('BrainDump — every goal, area by area', () => {
  it('lists the year’s goals under their areas, points out an empty area, and fills nothing', () => {
    render(<BrainDump yearWord="2027" areas={AREAS} goals={GOALS} onAdd={vi.fn()} />)
    expect(group('Health').getByText('Run a 10k')).toBeInTheDocument()
    expect(group('Money').getByText('Nothing in Money yet.')).toBeInTheDocument()
    expect(group('No area').getByText('Fix the gate')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox').every((t) => !t.getAttribute('placeholder') || t.getAttribute('placeholder') === 'Add a goal')).toBe(true)
  })

  it('adds a goal in its area, and clears the field once it saved', async () => {
    const onAdd = vi.fn(async () => true)
    render(<BrainDump yearWord="2027" areas={AREAS} goals={GOALS} onAdd={onAdd} />)
    const field = group('Money').getByRole('textbox', { name: 'New goal in Money' })
    fireEvent.change(field, { target: { value: '  Max the 401k ' } })
    await act(async () => { fireEvent.submit(field.closest('form')!) })
    expect(onAdd).toHaveBeenCalledWith('Max the 401k', 'm')
    expect(field).toHaveValue('')
  })

  it('a goal with no area goes in with none; a failed add keeps the words', async () => {
    const onAdd = vi.fn(async () => false)
    render(<BrainDump yearWord="2027" areas={AREAS} goals={GOALS} onAdd={onAdd} />)
    const field = group('No area').getByRole('textbox', { name: 'New goal, no area' })
    fireEvent.change(field, { target: { value: 'Redo the will' } })
    await act(async () => { fireEvent.click(group('No area').getByRole('button', { name: 'Add' })) })
    expect(onAdd).toHaveBeenCalledWith('Redo the will', null)
    expect(field).toHaveValue('Redo the will')
    expect(group('No area').getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('without life areas, one list for the year', () => {
    render(<BrainDump yearWord="2027" areas={[]} goals={GOALS} onAdd={vi.fn()} />)
    expect(screen.queryByRole('region', { name: 'No area' })).toBeNull()
    expect(screen.getByText('Run a 10k')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'New 2027 goal' })).toBeInTheDocument()
  })
})
