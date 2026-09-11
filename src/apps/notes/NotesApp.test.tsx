import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotesApp } from './NotesApp'
import type { DisplayNote } from '@/types/note'

function note(over: Partial<DisplayNote> = {}): DisplayNote {
  return {
    id: 'n1',
    content: '<p>Plumber quoted $400 for the water heater</p>',
    type: 'general',
    source: 'manual',
    createdAt: new Date('2026-08-28T10:00:00'),
    updatedAt: new Date('2026-08-28T10:00:00'),
    ...over,
  }
}

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const state = {
  notesByDate: [] as { date: string; label: string; notes: DisplayNote[] }[],
  loading: false,
  addNote: vi.fn().mockResolvedValue({ id: 'new' }),
  updateNote: vi.fn().mockResolvedValue(undefined),
  deleteNote: vi.fn().mockResolvedValue(undefined),
  deleteNotes: vi.fn().mockResolvedValue({ rows: [{ id: 'n1' }], links: [] }),
  restoreNotes: vi.fn().mockResolvedValue(undefined),
  getNoteById: vi.fn(),
}

vi.mock('@/hooks/useNotes', () => ({ useNotes: () => state }))
vi.mock('@/hooks/useNoteTopics', () => ({
  useNoteTopics: () => ({ topics: [], addTopic: vi.fn() }),
}))

function renderApp(initial = '/notes') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <NotesApp />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  navigate.mockClear()
  state.addNote.mockClear()
  state.deleteNotes.mockClear()
  state.restoreNotes.mockClear()
  state.deleteNotes.mockResolvedValue({ rows: [{ id: 'n1' }], links: [] })
  state.notesByDate = []
  state.loading = false
})

describe('NotesApp', () => {
  it('says the stream is empty rather than showing a bare page', () => {
    renderApp()
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument()
  })

  it('renders each date group under its label', () => {
    state.notesByDate = [
      { date: 'today', label: 'Today', notes: [note()] },
      { date: 'older', label: 'Older', notes: [note({ id: 'n2', content: '<p>Ask about the deductible</p>' })] },
    ]
    renderApp()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Older')).toBeInTheDocument()
    expect(screen.getByText(/Plumber quoted \$400/)).toBeInTheDocument()
    expect(screen.getByText(/Ask about the deductible/)).toBeInTheDocument()
  })

  it('strips markup so a row reads as plain text', () => {
    state.notesByDate = [{ date: 'today', label: 'Today', notes: [note()] }]
    renderApp()
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument()
    expect(screen.getByText('Plumber quoted $400 for the water heater')).toBeInTheDocument()
  })

  it('prefers a title over the content when the note has one', () => {
    state.notesByDate = [{
      date: 'today', label: 'Today',
      notes: [note({ title: 'Water heater' })],
    }]
    renderApp()
    expect(screen.getByText('Water heater')).toBeInTheDocument()
  })

  it('filters the stream by the search field', () => {
    state.notesByDate = [{
      date: 'today', label: 'Today',
      notes: [note(), note({ id: 'n2', content: '<p>Ask about the deductible</p>' })],
    }]
    renderApp()
    fireEvent.change(screen.getByPlaceholderText(/search notes/i), { target: { value: 'deductible' } })
    expect(screen.queryByText(/Plumber quoted/)).not.toBeInTheDocument()
    expect(screen.getByText(/Ask about the deductible/)).toBeInTheDocument()
  })

  it('drops a date group whose notes all filter out, rather than leaving a bare heading', () => {
    state.notesByDate = [
      { date: 'today', label: 'Today', notes: [note()] },
      { date: 'older', label: 'Older', notes: [note({ id: 'n2', content: '<p>deductible</p>' })] },
    ]
    renderApp()
    fireEvent.change(screen.getByPlaceholderText(/search notes/i), { target: { value: 'deductible' } })
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.getByText('Older')).toBeInTheDocument()
  })

  it('badges a note that came off a Supernote page', () => {
    state.notesByDate = [{
      date: 'today', label: 'Today',
      notes: [note({ source: 'import' })],
    }]
    renderApp()
    expect(screen.getByText(/from a page/i)).toBeInTheDocument()
  })

  it('shows a task note under its task title and opens the task, not the note modal', () => {
    state.notesByDate = [{
      date: 'today', label: 'Today',
      notes: [note({ id: 'task-t1', source: 'task', type: 'task_note', sourceTaskId: 't1', sourceTaskTitle: 'Fix the sink' })],
    }]
    renderApp()
    expect(screen.getByText('Fix the sink')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Plumber quoted/))
    expect(navigate).toHaveBeenCalledWith('/today?detail=task:t1')
  })

  it('writes a note from the composer and clears the field', () => {
    renderApp()
    const input = screen.getByPlaceholderText(/write a note/i)
    fireEvent.change(input, { target: { value: 'Deductible is $1500' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.addNote).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Deductible is $1500', type: 'general' }),
    )
    expect(input).toHaveValue('')
  })

  it('ignores an empty composer submit', () => {
    renderApp()
    const input = screen.getByPlaceholderText(/write a note/i)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.addNote).not.toHaveBeenCalled()
  })

  it('never writes a quick_capture, which would dual-write to the dormant vault bridge', () => {
    renderApp()
    const input = screen.getByPlaceholderText(/write a note/i)
    fireEvent.change(input, { target: { value: 'Scrap' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.addNote).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quick_capture' }),
    )
  })
})

// Bulk select and delete. Notes arrive faster than they are read — a week of
// school-digest imports, a paper page that parsed into twelve scraps — so the
// stream needs a way to clear a run of them without opening each one.
describe('NotesApp bulk delete', () => {
  const two = () => [
    note({ id: 'n1', content: '<p>Plumber quoted $400</p>' }),
    note({ id: 'n2', content: '<p>Ask about the deductible</p>' }),
  ]

  function enterSelectMode() {
    fireEvent.click(screen.getByRole('button', { name: /select notes/i }))
  }

  it('offers no selection until you ask for one', () => {
    state.notesByDate = [{ date: 'today', label: 'Today', notes: two() }]
    renderApp()
    expect(screen.queryByText(/select all/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/write a note/i)).toBeInTheDocument()
  })

  it('picks notes and deletes the ones picked', async () => {
    state.notesByDate = [{ date: 'today', label: 'Today', notes: two() }]
    renderApp()
    enterSelectMode()
    fireEvent.click(screen.getByText(/Plumber quoted/))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /delete 1/i }))
    await waitFor(() => expect(state.deleteNotes).toHaveBeenCalledWith(['n1']))
  })

  it('selects every note the filter is showing, and no others', () => {
    state.notesByDate = [{ date: 'today', label: 'Today', notes: two() }]
    renderApp()
    fireEvent.change(screen.getByPlaceholderText(/search notes/i), { target: { value: 'deductible' } })
    enterSelectMode()
    fireEvent.click(screen.getByRole('button', { name: /select all/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  // A task note is a projection of `tasks.notes`. Deleting it from here would
  // edit a task that isn't on screen, so it is never part of a selection.
  it('leaves task notes out of a selection', () => {
    state.notesByDate = [{
      date: 'today', label: 'Today',
      notes: [
        note({ id: 'task-t1', source: 'task', type: 'task_note', sourceTaskId: 't1', sourceTaskTitle: 'Fix the sink' }),
      ],
    }]
    renderApp()
    enterSelectMode()
    fireEvent.click(screen.getByText('Fix the sink'))
    expect(screen.getByText(/pick the notes to delete/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /select all/i })).toBeDisabled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('puts deleted notes back when you undo', async () => {
    const deleted = { rows: [{ id: 'n1' }], links: [] }
    state.deleteNotes.mockResolvedValue(deleted)
    state.notesByDate = [{ date: 'today', label: 'Today', notes: two() }]
    renderApp()
    enterSelectMode()
    fireEvent.click(screen.getByText(/Plumber quoted/))
    fireEvent.click(screen.getByRole('button', { name: /delete 1/i }))

    const undo = await screen.findByRole('button', { name: /undo/i })
    expect(screen.getByText('1 note deleted')).toBeInTheDocument()
    fireEvent.click(undo)
    expect(state.restoreNotes).toHaveBeenCalledWith(deleted)
  })

  it('drops out of select mode on Escape, keeping every note', () => {
    state.notesByDate = [{ date: 'today', label: 'Today', notes: two() }]
    renderApp()
    enterSelectMode()
    fireEvent.click(screen.getByText(/Plumber quoted/))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/write a note/i)).toBeInTheDocument()
    expect(state.deleteNotes).not.toHaveBeenCalled()
  })

  it('opens a note again once selection is over', () => {
    state.notesByDate = [{ date: 'today', label: 'Today', notes: two() }]
    renderApp()
    enterSelectMode()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    fireEvent.click(screen.getByText(/Plumber quoted/))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
