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

  it('the checkbox completes an item through the page toggle handler', async () => {
    const onCompleteTask = vi.fn()
    const { user } = render(<HorizonPoolDropdown {...base} label="Month"
      offer={['today', 'week', 'someday', 'deleted']} onCompleteTask={onCompleteTask}
      tasks={[task({ id: 'm1', title: 'Month thing', bucket: 'month' })]} />)
    await user.click(screen.getByRole('button', { name: /Month · 1/ }))
    const row = screen.getByText('Month thing').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Complete "Month thing"' }))
    expect(onCompleteTask).toHaveBeenCalledWith('m1')
    expect(within(row).getByText('done')).toBeInTheDocument()
    // Resolved rows offer no further fates.
    expect(within(row).queryByRole('button', { name: 'Today' })).toBeNull()
  })

  it('without a complete handler there is no checkbox', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="Week"
      offer={['today', 'tomorrow', 'someday', 'deleted']}
      tasks={[task({ id: 'w1', title: 'Week thing', bucket: 'week' })]} />)
    await user.click(screen.getByRole('button', { name: /Week · 1/ }))
    expect(screen.queryByRole('button', { name: /Complete "Week thing"/ })).toBeNull()
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

  it('labels each row when given metaFor — a pool row can say what it is asking of you', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="School"
      offer={['today', 'tomorrow', 'someday', 'deleted']}
      tasks={[task({ id: 's1', title: 'Bring a white t-shirt', bucket: 'inbox' })]}
      metaFor={(t) => (t.id === 's1'
        ? { text: 'Tomorrow 9a · gym · Kaleb', title: '3-01 Mr. Gorby / Ms. Rozanc' }
        : undefined)}
    />)
    await user.click(screen.getByRole('button', { name: /School/ }))
    expect(screen.getByText('Tomorrow 9a · gym · Kaleb')).toBeInTheDocument()
  })

  it('keeps a long title and its detail on separate lines, neither truncated', async () => {
    const title = 'Check Red Take Home Folder for papers and Family Letter about Reveal Math'
    const detail = 'Today 7:40a · classroom · to school, by Today 7:30a, arrive on time · Kaleb'
    const { user } = render(<HorizonPoolDropdown {...base} label="School"
      offer={['today', 'someday', 'deleted']}
      tasks={[task({ id: 's2', title, bucket: 'inbox' })]}
      metaFor={() => ({ text: detail, title: '3-02 Ms. Rozanc / Mr. Gorby' })}
    />)
    await user.click(screen.getByRole('button', { name: /School/ }))
    // Both render in full, and the detail is its own element rather than a
    // span sharing the title's line.
    const titleEl = screen.getByText(title)
    const detailEl = screen.getByText(detail)
    expect(titleEl).not.toContainElement(detailEl)
    expect(detailEl).toHaveAttribute('title', '3-02 Ms. Rozanc / Mr. Gorby')
  })

  it('renders rows unlabelled when metaFor is not given', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="Week"
      offer={['today']}
      tasks={[task({ id: 'w1', title: 'Week thing', bucket: 'week' })]}
    />)
    await user.click(screen.getByRole('button', { name: /Week/ }))
    expect(screen.getByText('Week thing')).toBeInTheDocument()
  })

  it('puts a dot on the trigger when something arrived since the last look', async () => {
    render(<HorizonPoolDropdown {...base} label="School" offer={['today']} hasNew
      tasks={[task({ id: 's1', title: 'A thing', bucket: 'inbox' })]} />)
    expect(await screen.findByLabelText('New in school')).toBeInTheDocument()
  })

  it('shows no dot when nothing is new — the quiet state is the common one', () => {
    render(<HorizonPoolDropdown {...base} label="School" offer={['today']}
      tasks={[task({ id: 's1', title: 'A thing', bucket: 'inbox' })]} />)
    expect(screen.queryByLabelText('New in school')).toBeNull()
  })

  it('marks only the new rows, so two can be found among three', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="School" offer={['today']}
      tasks={[
        task({ id: 'old', title: 'Seen already', bucket: 'inbox' }),
        task({ id: 'new1', title: 'Just arrived', bucket: 'inbox' }),
        task({ id: 'new2', title: 'Also just arrived', bucket: 'inbox' }),
      ]}
      isNewFor={(t) => t.id !== 'old'}
    />)
    await user.click(screen.getByRole('button', { name: /School/ }))
    expect(screen.getAllByText('New since you last looked')).toHaveLength(2)
    expect(within(screen.getByText('Seen already').closest('li')!)
      .queryByText('New since you last looked')).toBeNull()
  })

  it('reports opening and closing, which is how the host records the look', async () => {
    const onOpenChange = vi.fn()
    const { user } = render(<HorizonPoolDropdown {...base} label="School" offer={['today']}
      tasks={[task({ id: 's1', title: 'A thing', bucket: 'inbox' })]}
      onOpenChange={onOpenChange} />)
    const trigger = screen.getByRole('button', { name: /School/ })
    await user.click(trigger)
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await user.click(trigger)
    // Closed, not opened again — the mark is written on the way out so the
    // row markers survive being looked at.
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
})
