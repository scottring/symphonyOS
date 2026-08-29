import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotePicker } from './NotePicker'
import type { Note } from '@/types/note'
import { ALL_LAYERS, UNSORTED, type Layer } from '@/lib/domains'

const L = (...xs: Layer[]) => new Set<Layer>(xs)

const invokeMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}))

const note = (id: string, title: string, content = '', readonly = false, context: Note['context'] = undefined): Note => ({
  id,
  title,
  content,
  type: 'general',
  source: 'manual',
  readonly,
  context,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
})

describe('NotePicker', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({
      data: { best_match: { id: 'n1', confidence: 0.8 }, suggested_new_title: 'Bike storage ideas' },
      error: null,
    })
  })

  it('shows the AI best-match chip above confidence threshold', async () => {
    render(
      <NotePicker
        task={{ id: 't1', title: 'Bike storage', notes: undefined }}
        notes={[note('n1', 'Backyard reno'), note('n2', 'Vendors')]}
        layers={ALL_LAYERS}
        domain="family"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText(/Backyard reno/i)).toBeInTheDocument())
    // Best-match chip visible
    expect(screen.getByRole('button', { name: /best match.*backyard reno/i })).toBeInTheDocument()
  })

  it('hides the best-match chip when confidence < 0.6', async () => {
    invokeMock.mockResolvedValue({
      data: { best_match: { id: 'n1', confidence: 0.4 }, suggested_new_title: 'X' },
      error: null,
    })
    render(
      <NotePicker
        task={{ id: 't2-low-confidence', title: 'X', notes: undefined }}
        notes={[note('n1', 'Foo')]}
        layers={ALL_LAYERS}
        domain="universal"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: /best match/i })).not.toBeInTheDocument())
  })

  it('filters existing notes by case-insensitive substring on title and content', () => {
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[
          note('n1', 'Backyard reno', 'budget'),
          note('n2', 'Vendors', 'plumber'),
          note('n3', 'BACKYARD FENCE', ''),
        ]}
        layers={ALL_LAYERS}
        domain="universal"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const search = screen.getByPlaceholderText(/search notes/i)
    fireEvent.change(search, { target: { value: 'backyard' } })
    expect(screen.getByText('Backyard reno')).toBeInTheDocument()
    expect(screen.getByText('BACKYARD FENCE')).toBeInTheDocument()
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
  })

  it('excludes vault-readonly notes from the list', () => {
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[note('n1', 'Editable note', '', false), note('n2', 'Vault note', '', true)]}
        layers={ALL_LAYERS}
        domain="universal"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Editable note')).toBeInTheDocument()
    expect(screen.queryByText('Vault note')).not.toBeInTheDocument()
  })

  it('applies the layer filter: only the checked layers show, untagged is Unsorted (not "everywhere")', () => {
    const notes = [
      note('n1', 'Work note', '', false, 'work'),
      note('n2', 'Family note', '', false, 'family'),
      note('n3', 'No-context note', '', false),
    ]
    const { rerender } = render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={notes}
        layers={L('family')}
        domain="family"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Family note')).toBeInTheDocument()
    expect(screen.queryByText('Work note')).not.toBeInTheDocument()
    // Untagged is the Unsorted layer, not "everywhere" — unchecked, it hides.
    expect(screen.queryByText('No-context note')).not.toBeInTheDocument()

    // Checking Unsorted alongside Family brings it back.
    rerender(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={notes}
        layers={L('family', UNSORTED)}
        domain="family"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('No-context note')).toBeInTheDocument()
  })

  it('calls onSelect with kind=existing when an existing note is tapped', () => {
    const onSelect = vi.fn()
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[note('n1', 'Backyard reno')]}
        layers={ALL_LAYERS}
        domain="universal"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Backyard reno'))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'existing', noteId: 'n1' })
  })

  it('expands inline create-new form when "+ Create new note" is tapped and calls onSelect with kind=new', () => {
    const onSelect = vi.fn()
    render(
      <NotePicker
        task={{ id: 't1', title: 'My idea', notes: undefined }}
        notes={[]}
        layers={ALL_LAYERS}
        domain="universal"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText(/Create new note/i))
    const input = screen.getByLabelText(/note title/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Bike storage' } })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'new', title: 'Bike storage' })
  })
})
