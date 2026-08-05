import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelNotes, notesPreview } from './PanelNotes'

// The real editor is a lazy Tiptap chunk; stand in for it so these tests assert
// THIS component's behavior, not Tiptap's.
vi.mock('@/components/notes/TiptapEditor', () => ({
  TiptapEditor: ({ content }: { content: string }) => (
    <div data-testid="editor">{content}</div>
  ),
}))

describe('notesPreview', () => {
  it('strips tags and collapses whitespace', () => {
    expect(notesPreview('<p>Ask about  the 3pm</p>')).toBe('Ask about the 3pm')
  })

  it('truncates long text', () => {
    expect(notesPreview(`<p>${'a'.repeat(100)}</p>`)).toBe(`${'a'.repeat(60)}…`)
  })

  it('returns undefined for empty markup', () => {
    expect(notesPreview('<p></p>')).toBeUndefined()
    expect(notesPreview(undefined)).toBeUndefined()
  })
})

describe('PanelNotes', () => {
  beforeEach(() => localStorage.clear())

  it('shows the editor immediately — there is no click-to-edit mode', async () => {
    render(<PanelNotes notes="<p>hi</p>" onChange={vi.fn()} />)
    expect(await screen.findByTestId('editor')).toBeInTheDocument()
  })

  it('opens and closes the wide overlay with one control', async () => {
    const user = userEvent.setup()
    render(<PanelNotes notes="<p>hi</p>" onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /widen notes/i }))
    expect(screen.getByTestId('notes-overlay')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /narrow notes/i }))
    expect(screen.queryByTestId('notes-overlay')).not.toBeInTheDocument()
  })

  it('closes the wide overlay on Escape', async () => {
    const user = userEvent.setup()
    render(<PanelNotes notes="<p>hi</p>" onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /widen notes/i }))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('notes-overlay')).not.toBeInTheDocument()
  })

  it('collapses to a preview and unmounts the editor', async () => {
    const user = userEvent.setup()
    render(<PanelNotes notes="<p>Ask about the 3pm</p>" onChange={vi.fn()} />)
    expect(await screen.findByTestId('editor')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /collapse notes/i }))

    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
    expect(screen.getByText('Ask about the 3pm')).toBeInTheDocument()
  })

  it('honours a custom label and collapse id', () => {
    render(
      <PanelNotes notes="<p>x</p>" onChange={vi.fn()} label="What to bring" id="what-to-bring" />,
    )
    expect(screen.getByText('What to bring')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /widen what to bring/i })).toBeInTheDocument()
  })

  it('renders nothing when there is no content and no way to add any', () => {
    const { container } = render(<PanelNotes notes={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
