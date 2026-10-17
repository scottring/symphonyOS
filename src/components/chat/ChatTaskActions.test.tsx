import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatMessage } from './ChatMessage'
import { ChatTaskActionsProvider } from './ChatTaskActions'
import type { Task } from '@/types/task'

const run = vi.fn(async (_label: string, command: () => Promise<unknown>) => { await command(); return true })
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ run }) }))
const setSelection = vi.fn()
vi.mock('@/shell/providers/SelectionProvider', () => ({ useSelectionOptional: () => ({ setSelection }) }))

const task = (id: string, title: string, extra: Partial<Task> = {}) =>
  ({ id, title, completed: false, createdAt: new Date(), ...extra }) as Task

const reply = {
  id: 'm1', role: 'assistant' as const, timestamp: new Date(),
  content: "**From last week, 2 things didn't finish:**\n- Pick up the kids — early release\n- Frame the posters\n- Something Symphony made up",
}

function renderReply(tasks: Task[]) {
  const toggleTask = vi.fn(async () => true)
  const updateTask = vi.fn(async () => true)
  render(<ChatTaskActionsProvider tasks={tasks} toggleTask={toggleTask} updateTask={updateTask}><ChatMessage message={reply} /></ChatTaskActionsProvider>)
  return { toggleTask, updateTask }
}

describe('actions on tasks Symphony names in a reply (Scott, 2026-10-17)', () => {
  it('gives each named task Done, Today and Open; other lines stay text', () => {
    renderReply([task('kids', 'Pick up the kids'), task('posters', 'Frame the posters')])
    expect(screen.getAllByRole('group', { name: /Actions for/ })).toHaveLength(2)
    expect(screen.getByText(/Something Symphony made up/)).toBeInTheDocument()
    // The bold heading still renders as markdown.
    expect(screen.getByText("From last week, 2 things didn't finish:").tagName).toBe('STRONG')
  })

  it('marks a task done through the receipt, with Undo', async () => {
    const { toggleTask } = renderReply([task('posters', 'Frame the posters')])
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(run).toHaveBeenCalledWith('Done: “Frame the posters”', expect.any(Function), expect.objectContaining({ ids: ['posters'], undo: expect.any(Function) }))
    await vi.waitFor(() => expect(toggleTask).toHaveBeenCalledWith('posters'))
  })

  it('plans a task for today, and Undo puts back what it had', async () => {
    const { updateTask } = renderReply([task('posters', 'Frame the posters', { bucket: 'week' })])
    fireEvent.click(screen.getByRole('button', { name: /Today/ }))
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledWith('posters', expect.objectContaining({ bucket: 'timed', isAllDay: true })))
    const undo = run.mock.calls.at(-1)![2].undo
    await undo()
    expect(updateTask).toHaveBeenLastCalledWith('posters', expect.objectContaining({ bucket: 'week', scheduledFor: undefined }))
  })

  it('opens the task, and offers no Today for one already today', () => {
    renderReply([task('posters', 'Frame the posters', { scheduledFor: new Date(), bucket: 'timed' })])
    expect(screen.queryByRole('button', { name: /Today/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open “Frame the posters”' }))
    expect(setSelection).toHaveBeenCalledWith({ kind: 'task', id: 'posters' })
  })
})
