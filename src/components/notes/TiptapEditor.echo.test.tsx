/**
 * A note must never be written back just because the editor re-rendered.
 *
 * Tiptap's `setEditable(editable, emitUpdate = true)` emits a synthetic
 * `update` carrying NO document change. Routed through `onUpdate` that becomes
 * `onChange(getHTML())`, and every consumer persists it. While notes are still
 * loading the editor holds an empty document, so the echo overwrites the real
 * note with nothing — it destroyed a live event note on 2026-08-05.
 *
 * These tests use the REAL editor: the global stub in src/test/setup.ts drops
 * onChange entirely, which is exactly why the suite could not see this.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { TiptapEditor } from './TiptapEditor'
import { PanelNotes } from '@/components/surface/sections/PanelNotes'

vi.unmock('@/components/notes/TiptapEditor')

/** The editor mounts asynchronously; give ProseMirror a tick to settle. */
const settle = () => new Promise((r) => setTimeout(r, 250))

describe('TiptapEditor does not echo content back to its consumer', () => {
  it('never calls onChange when only re-rendered', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<TiptapEditor content="<p>KEEP ME</p>" onChange={onChange} />)
    await settle()

    // Re-render with identical props, the way a panel does on any parent update.
    rerender(<TiptapEditor content="<p>KEEP ME</p>" onChange={onChange} />)
    await settle()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('never calls onChange when the editable flag is applied', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <TiptapEditor content="<p>KEEP ME</p>" onChange={onChange} editable={false} />,
    )
    await settle()

    rerender(<TiptapEditor content="<p>KEEP ME</p>" onChange={onChange} editable />)
    await settle()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('never calls onChange when external content arrives', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<TiptapEditor content="" onChange={onChange} />)
    await settle()

    rerender(<TiptapEditor content="<p>ARRIVED FROM SERVER</p>" onChange={onChange} />)
    await settle()

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('PanelNotes never writes while notes are loading', () => {
  it('emits nothing across open → notes arrive → transient miss', async () => {
    const calls: string[] = []
    const onChange = (next: string) => calls.push(next)

    // Panel opens before the note has loaded — the editor holds an empty doc.
    const { rerender } = render(<PanelNotes notes={undefined} onChange={onChange} />)
    await waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy())
    await settle()

    // The note arrives from the server.
    rerender(<PanelNotes notes="<p>KEEP ME</p>" onChange={onChange} />)
    await settle()

    // A realtime refresh momentarily reports no note.
    rerender(<PanelNotes notes={undefined} onChange={onChange} />)
    await settle()

    // Not one of these is a user edit, so not one may reach the database.
    expect(calls).toEqual([])
  })
})
