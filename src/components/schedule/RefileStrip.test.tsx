import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RefileStrip } from './RefileStrip'
import type { RefileRow } from '@/lib/today/refile'
import type { Task } from '@/types/task'

const t = (o: Partial<Task>): Task =>
  ({ id: 't1', title: 'Test task', completed: false, bucket: 'inbox', createdAt: new Date(), updatedAt: new Date(), userId: 'me', ...o }) as Task

describe('RefileStrip', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(<RefileStrip rows={[]} onFile={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the family-private sentence and re-files via the domain chooser', () => {
    const onFile = vi.fn()
    const task = t({ context: 'family', scope: 'individual' })
    const rows: RefileRow[] = [{ task, kind: 'family-private' }]
    render(<RefileStrip rows={rows} onFile={onFile} />)

    expect(screen.getByText(/marked Family but only you can see it/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /personal/i }))
    expect(onFile).toHaveBeenCalledWith(task, 'personal')
  })

  it('keeps a private-shared row private on "Keep private"', () => {
    const onFile = vi.fn()
    const task = t({ context: 'personal', scope: 'compound' })
    const rows: RefileRow[] = [{ task, kind: 'private-shared' }]
    render(<RefileStrip rows={rows} onFile={onFile} />)

    expect(screen.getByText(/private item is readable by the household/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /keep private/i }))
    expect(onFile).toHaveBeenCalledWith(task, 'personal')
  })

  it('moves a private-shared row to Family', () => {
    const onFile = vi.fn()
    const task = t({ context: 'work', scope: 'compound' })
    const rows: RefileRow[] = [{ task, kind: 'private-shared' }]
    render(<RefileStrip rows={rows} onFile={onFile} />)

    fireEvent.click(screen.getByRole('button', { name: /move to family/i }))
    expect(onFile).toHaveBeenCalledWith(task, 'family')
  })
})
