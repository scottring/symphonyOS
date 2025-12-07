import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { NotesPage } from './NotesPage'
import type { Note, NoteTopic } from '@/types/note'

// Mock data
const mockTopics: NoteTopic[] = [
  {
    id: 'topic-1',
    name: 'Work',
    color: '#3B82F6',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'topic-2',
    name: 'Personal',
    color: '#10B981',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const mockNotes: Note[] = [
  {
    id: 'note-1',
    title: 'Work Meeting Notes',
    content: 'Discussed Q4 objectives',
    type: 'meeting_note',
    source: 'manual',
    topicId: 'topic-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'note-2',
    content: 'Personal grocery list',
    type: 'quick_capture',
    source: 'manual',
    topicId: 'topic-2',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'note-3',
    title: 'General thoughts',
    content: 'Some random ideas',
    type: 'general',
    source: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const mockNotesByDate = [
  {
    date: new Date().toISOString().split('T')[0],
    label: 'Today',
    notes: mockNotes,
  },
]

const mockTopicsMap = new Map(mockTopics.map((t) => [t.id, t]))

const defaultProps = {
  notes: mockNotes,
  notesByDate: mockNotesByDate,
  topics: mockTopics,
  topicsMap: mockTopicsMap,
  loading: false,
  onAddNote: vi.fn().mockResolvedValue(null),
  onUpdateNote: vi.fn().mockResolvedValue(undefined),
  onDeleteNote: vi.fn().mockResolvedValue(undefined),
  onAddTopic: vi.fn().mockResolvedValue(null),
}

describe('NotesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    render(<NotesPage {...defaultProps} loading={true} />)

    expect(screen.getByText('Loading notes...')).toBeInTheDocument()
  })

  it('renders the notes list', () => {
    render(<NotesPage {...defaultProps} />)

    expect(screen.getByText('Work Meeting Notes')).toBeInTheDocument()
    expect(screen.getByText('Personal grocery list')).toBeInTheDocument()
    expect(screen.getByText('General thoughts')).toBeInTheDocument()
  })

  it('renders the quick capture input', () => {
    render(<NotesPage {...defaultProps} />)

    // Actual placeholder text from NotesQuickCapture
    expect(screen.getByPlaceholderText('Jot something down...')).toBeInTheDocument()
  })

  it('renders topic filters with All Notes', () => {
    render(<NotesPage {...defaultProps} />)

    // The filter shows "All Notes • 3"
    expect(screen.getByText(/All Notes/)).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('shows empty state in detail pane when no note selected', () => {
    render(<NotesPage {...defaultProps} />)

    expect(screen.getByText('Select a note to view')).toBeInTheDocument()
  })

  it('selects a note when clicked', async () => {
    const { user } = render(<NotesPage {...defaultProps} />)

    await user.click(screen.getByText('Work Meeting Notes'))

    await waitFor(() => {
      // The note content should now be visible in the detail pane
      expect(screen.getByText('Discussed Q4 objectives')).toBeInTheDocument()
    })
  })

  it('filters notes by topic when topic is selected', async () => {
    const { user } = render(<NotesPage {...defaultProps} />)

    // Click on Work topic filter (text contains "Work")
    const workButton = screen.getByRole('button', { name: /Work.*1/i })
    await user.click(workButton)

    await waitFor(() => {
      // Only Work notes should be visible
      expect(screen.getByText('Work Meeting Notes')).toBeInTheDocument()
      expect(screen.queryByText('Personal grocery list')).not.toBeInTheDocument()
      expect(screen.queryByText('General thoughts')).not.toBeInTheDocument()
    })
  })

  it('shows all notes when "All Notes" filter is clicked', async () => {
    const { user } = render(<NotesPage {...defaultProps} />)

    // First filter by Work
    const workButton = screen.getByRole('button', { name: /Work.*1/i })
    await user.click(workButton)

    // Then click All Notes to show all notes again
    const allButton = screen.getByRole('button', { name: /All Notes/i })
    await user.click(allButton)

    await waitFor(() => {
      expect(screen.getByText('Work Meeting Notes')).toBeInTheDocument()
      expect(screen.getByText('Personal grocery list')).toBeInTheDocument()
      expect(screen.getByText('General thoughts')).toBeInTheDocument()
    })
  })

  it('calls onAddNote when quick capture is submitted', async () => {
    const onAddNote = vi.fn().mockResolvedValue({
      id: 'new-note',
      content: 'New test note',
    })
    const { user } = render(<NotesPage {...defaultProps} onAddNote={onAddNote} />)

    const input = screen.getByPlaceholderText('Jot something down...')
    await user.type(input, 'New test note')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(onAddNote).toHaveBeenCalledWith('New test note', undefined)
    })
  })

  it('shows empty state when no notes exist', () => {
    render(<NotesPage {...defaultProps} notes={[]} notesByDate={[]} />)

    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })

  it('displays date group labels', () => {
    render(<NotesPage {...defaultProps} />)

    expect(screen.getByText('Today')).toBeInTheDocument()
  })
})
