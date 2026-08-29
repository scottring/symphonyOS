import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
