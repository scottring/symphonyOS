import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Task } from '@/types/task'

const navigateSpy = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigateSpy,
}))
vi.mock('@/shell/providers/SelectionProvider', () => ({
  useSelection: () => ({ selection: null, setSelection: vi.fn() }),
}))

const task = (over: Partial<Task>): Task => ({
  id: 'x', title: 't', completed: false, bucket: 'inbox', isAllDay: true,
  context: null, assignedTo: null, assignedToAll: [],
  createdAt: new Date(), updatedAt: new Date(),
  ...(over as Task),
})

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({ tasks: [task({ id: 't1', title: 'Replace kitchen light bulbs' })] }),
}))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [] }) }))
vi.mock('@/hooks/useContacts', () => ({ useContacts: () => ({ contacts: [] }) }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ routines: [] }) }))
vi.mock('@/contexts/ListsContext', () => ({ useListsContext: () => ({ lists: [] }) }))

import { OmniboxResults } from './OmniboxResults'

describe('OmniboxResults', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows matching items for the query and navigates on click', async () => {
    render(<OmniboxResults query="light bulbs" onNavigate={vi.fn()} />)
    const row = await screen.findByText('Replace kitchen light bulbs')
    fireEvent.click(row)
    expect(navigateSpy).toHaveBeenCalledWith(expect.stringContaining('detail=task:t1'))
  })

  it('closes the host after navigating', async () => {
    const onNavigate = vi.fn()
    render(<OmniboxResults query="light" onNavigate={onNavigate} />)
    fireEvent.click(await screen.findByText('Replace kitchen light bulbs'))
    expect(onNavigate).toHaveBeenCalled()
  })

  it('renders nothing when there are no matches', async () => {
    const { container } = render(<OmniboxResults query="zzzznope" onNavigate={vi.fn()} />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('clicking a result inside a form does not submit it (QuickCapture regression)', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <OmniboxResults query="light" onNavigate={vi.fn()} />
      </form>,
    )
    fireEvent.click(await screen.findByText('Replace kitchen light bulbs'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ArrowDown then Enter opens the highlighted result', async () => {
    const onNavigate = vi.fn()
    render(<OmniboxResults query="light" onNavigate={onNavigate} />)
    await screen.findByText('Replace kitchen light bulbs')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(navigateSpy).toHaveBeenCalledWith(expect.stringContaining('detail=task:t1'))
    expect(onNavigate).toHaveBeenCalled()
  })

  it('plain Enter with no highlight does not hijack submission', async () => {
    render(<OmniboxResults query="light" onNavigate={vi.fn()} />)
    await screen.findByText('Replace kitchen light bulbs')
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(navigateSpy).not.toHaveBeenCalled()
  })
})
