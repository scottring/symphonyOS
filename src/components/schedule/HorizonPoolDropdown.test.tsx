import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { HorizonPoolDropdown } from './HorizonPoolDropdown'
import type { Task } from '@/types/task'

const task = (p: Partial<Task>): Task => ({ id: 'x', title: 't', completed: false, ...p } as Task)

const base = {
  viewedDate: new Date(),
  onUpdateTask: vi.fn(),
}

describe('HorizonPoolDropdown — the pools live up here, never in the review', () => {
  it('renders a closed trigger with the count; rows only appear on open', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="Month"
      offer={['today', 'week', 'someday', 'deleted']}
      tasks={[
        task({ id: 'm1', title: 'Month thing', bucket: 'month' }),
        task({ id: 'm2', title: 'Other month thing', bucket: 'month' }),
      ]} />)
    const trigger = screen.getByRole('button', { name: /Month · 2/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Month thing')).not.toBeInTheDocument()
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Month thing')).toBeInTheDocument()
    expect(screen.getByText('Other month thing')).toBeInTheDocument()
  })

  it('a pick writes through pushTask and resolves the row in place', async () => {
    const onPushTask = vi.fn()
    const { user } = render(<HorizonPoolDropdown {...base} label="Week"
      offer={['today', 'tomorrow', 'someday', 'deleted']} onPushTask={onPushTask}
      tasks={[task({ id: 'w1', title: 'Week thing', bucket: 'week' })]} />)
    await user.click(screen.getByRole('button', { name: /Week · 1/ }))
    const row = screen.getByText('Week thing').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Today' }))
    expect(onPushTask).toHaveBeenCalledWith('w1', expect.any(Date))
    expect(within(row).getByText('today')).toBeInTheDocument()
  })

  it('the week variant never offers "This wk"; the month variant does', async () => {
    const week = render(<HorizonPoolDropdown {...base} label="Week"
      offer={['today', 'tomorrow', 'someday', 'deleted']}
      tasks={[task({ id: 'w1', title: 'Week thing', bucket: 'week' })]} />)
    await week.user.click(screen.getByRole('button', { name: /Week · 1/ }))
    expect(screen.queryByRole('button', { name: 'This wk' })).toBeNull()
    week.unmount()
    const month = render(<HorizonPoolDropdown {...base} label="Month"
      offer={['today', 'week', 'someday', 'deleted']}
      tasks={[task({ id: 'm1', title: 'Month thing', bucket: 'month' })]} />)
    await month.user.click(screen.getByRole('button', { name: /Month · 1/ }))
    expect(screen.getByRole('button', { name: 'This wk' })).toBeInTheDocument()
  })

  it('an empty pool still has a trigger — the place to look is always there', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="Week"
      offer={['today', 'tomorrow', 'someday', 'deleted']} tasks={[]} />)
    const trigger = screen.getByRole('button', { name: /Week · 0/ })
    await user.click(trigger)
    expect(screen.getByText('Nothing here right now.')).toBeInTheDocument()
  })

  it('closing clears resolved verdicts so a reopen shows the fresh pool', async () => {
    const onPushTask = vi.fn()
    const { user } = render(<HorizonPoolDropdown {...base} label="Week"
      offer={['today', 'tomorrow', 'someday', 'deleted']} onPushTask={onPushTask}
      tasks={[task({ id: 'w1', title: 'Week thing', bucket: 'week' })]} />)
    const trigger = screen.getByRole('button', { name: /Week · 1/ })
    await user.click(trigger)
    const row = screen.getByText('Week thing').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Today' }))
    expect(within(row).getByText('today')).toBeInTheDocument()
    await user.click(trigger) // close
    await user.click(trigger) // reopen — verdict marks are gone
    const freshRow = screen.getByText('Week thing').closest('li')!
    expect(within(freshRow).queryByText('today')).toBeNull()
    expect(within(freshRow).getByRole('button', { name: 'Today' })).toBeInTheDocument()
  })
})
