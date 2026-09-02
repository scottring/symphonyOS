/**
 * The editor's job at mount is to render the note it was given — including the
 * notes nobody typed here. Agents, the MCP server and the ingest edge functions
 * write plain text and markdown into the same column, and Tiptap parses its
 * `content` as HTML, so those notes arrived as one long paragraph full of "- ".
 *
 * These tests use the REAL editor (the global stub in src/test/setup.ts renders
 * a plain div, which cannot see any of this).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { TiptapEditor } from './TiptapEditor'

vi.unmock('@/components/notes/TiptapEditor')

const mounted = () => waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy())

describe('TiptapEditor renders unformatted notes as structure', () => {
  it('turns an ALL-CAPS header and dashed lines into a heading and a list', async () => {
    render(
      <TiptapEditor
        content={'OPEN QUESTIONS\n- Does it renew?\n- Who signs?'}
        onChange={vi.fn()}
      />,
    )
    await mounted()

    await waitFor(() => {
      const doc = document.querySelector('.ProseMirror')!
      expect(doc.querySelector('h3')?.textContent).toBe('OPEN QUESTIONS')
      expect(Array.from(doc.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
        'Does it renew?',
        'Who signs?',
      ])
    })
  })

  it('keeps blank-line-separated prose as separate paragraphs', async () => {
    render(<TiptapEditor content={'First thought.\n\nSecond thought.'} onChange={vi.fn()} />)
    await mounted()

    await waitFor(() => {
      const paragraphs = document.querySelectorAll('.ProseMirror > p')
      expect(Array.from(paragraphs).map((p) => p.textContent)).toEqual([
        'First thought.',
        'Second thought.',
      ])
    })
  })

  it('leaves a note that is already HTML alone', async () => {
    render(<TiptapEditor content="<p>Ask about the <em>3pm</em></p>" onChange={vi.fn()} />)
    await mounted()

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror p')?.innerHTML).toContain('<em>3pm</em>')
    })
  })

  it('does not write the converted HTML back to its consumer', async () => {
    const onChange = vi.fn()
    render(<TiptapEditor content={'PLAIN NOTE\n- one'} onChange={onChange} />)
    await mounted()
    await new Promise((r) => setTimeout(r, 250))

    // Conversion is a rendering concern. Persisting it would rewrite every
    // agent-written note the moment a panel merely opened.
    expect(onChange).not.toHaveBeenCalled()
  })
})
