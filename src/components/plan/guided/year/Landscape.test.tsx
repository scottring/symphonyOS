import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { Landscape, YearLandscape } from './Landscape'
import { entriesOf } from '@/lib/guide/landscape'

const cell = (month: string) => screen.getByRole('textbox', { name: month })

describe('Landscape — the year on one page, month by month', () => {
  it('twelve empty months, January first', () => {
    render(<Landscape value={[]} onChange={vi.fn()} />)
    const months = within(screen.getByRole('list', { name: 'The 12 months' })).getAllByRole('listitem')
    expect(months).toHaveLength(12)
    expect(months[0]).toHaveAccessibleName('January')
    expect(months[11]).toHaveAccessibleName('December')
    expect(cell('March')).toHaveValue('')
  })

  it('counts entries as non-empty lines', () => {
    expect(entriesOf('Spring break\n\n  \nTaxes due\nCamp')).toBe(3)
    expect(entriesOf('   ')).toBe(0)
  })

  it('marks a month with three or more entries crowded, as typed', () => {
    render(<Landscape value={[{ month: 7, text: 'Beach week\nCamp' }]} onChange={vi.fn()} />)
    const july = screen.getByRole('listitem', { name: 'July' })
    expect(within(july).queryByText('Crowded')).toBeNull()
    fireEvent.change(cell('July'), { target: { value: 'Beach week\nCamp\nWedding' } })
    expect(within(july).getByText('Crowded')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'June' })).queryByText('Crowded')).toBeNull()
  })

  it('saves a month when it is left, only if it changed; an emptied month drops out', () => {
    const onChange = vi.fn()
    render(<Landscape value={[{ month: 3, text: 'Spring break' }, { month: 7, text: 'Camp' }]} onChange={onChange} />)
    fireEvent.blur(cell('March'))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(cell('April'), { target: { value: 'Taxes due  ' } })
    fireEvent.blur(cell('April'))
    expect(onChange).toHaveBeenLastCalledWith([{ month: 3, text: 'Spring break' }, { month: 4, text: 'Taxes due' }, { month: 7, text: 'Camp' }])
    fireEvent.change(cell('July'), { target: { value: '' } })
    fireEvent.blur(cell('July'))
    expect(onChange).toHaveBeenLastCalledWith([{ month: 3, text: 'Spring break' }])
  })
})

describe('YearLandscape — saved into the year’s notes', () => {
  it('patches the landscape; a failed save can be sent again', async () => {
    const patch = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    render(<YearLandscape patch={patch} />)
    fireEvent.change(cell('May'), { target: { value: 'Graduation' } })
    await act(async () => { fireEvent.blur(cell('May')) })
    expect(patch).toHaveBeenCalledWith({ landscape: [{ month: 5, text: 'Graduation' }] })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save.')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
    expect(patch.mock.calls[1][0]).toEqual({ landscape: [{ month: 5, text: 'Graduation' }] })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
