import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { PanelNotes } from './PanelNotes'

// A25 (walkthrough 2026-09-21): every keystroke called onChange, every onChange
// fired its own PATCH, and the requests resolved out of order — the row kept
// whichever keystroke the server applied last ("…and the re" instead of
// "…and the receipt", measured live on the demo account). These tests drive
// PanelNotes' save path the way the editor does: many onChange calls, fast.

let emit: (html: string) => void = () => {}
vi.mock('@/components/notes/TiptapEditor', () => ({
  TiptapEditor: ({ onChange }: { onChange: (html: string) => void }) => {
    emit = onChange
    return <div data-testid="editor" />
  },
}))

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function flush() {
  await act(async () => { await Promise.resolve() })
}

describe('PanelNotes saving', () => {
  beforeEach(() => localStorage.clear())

  it('never has two writes in flight, and the last write carries the latest text', async () => {
    const calls: { html: string; d: ReturnType<typeof deferred<boolean>> }[] = []
    const onChange = vi.fn((html: string) => {
      const d = deferred<boolean>()
      calls.push({ html, d })
      return d.promise
    })
    render(<PanelNotes notes="" onChange={onChange} />)
    await screen.findByTestId('editor')

    act(() => {
      emit('<p>bring old card a</p>')
      emit('<p>bring old card an</p>')
      emit('<p>bring old card and</p>')
    })
    expect(calls).toHaveLength(1)

    calls[0].d.resolve(true)
    await flush()
    // The middle keystroke is skipped; the next write is the newest text.
    expect(calls).toHaveLength(2)
    expect(calls[1].html).toBe('<p>bring old card and</p>')

    calls[1].d.resolve(true)
    await flush()
    expect(calls).toHaveLength(2)
    expect(calls[calls.length - 1].html).toBe('<p>bring old card and</p>')
  })

  it('shows Saved only after the write succeeds', async () => {
    const d = deferred<boolean>()
    render(<PanelNotes notes="" onChange={() => d.promise} />)
    await screen.findByTestId('editor')

    act(() => emit('<p>x</p>'))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.getByText('Saving…')).toBeInTheDocument()

    d.resolve(true)
    await flush()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('says Not saved when the write fails', async () => {
    const d = deferred<boolean>()
    render(<PanelNotes notes="" onChange={() => d.promise} />)
    await screen.findByTestId('editor')

    act(() => emit('<p>x</p>'))
    d.resolve(false)
    await flush()
    expect(screen.getByText('Not saved')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('still writes the queued latest text after the panel closes', async () => {
    const calls: { html: string; d: ReturnType<typeof deferred<boolean>> }[] = []
    const onChange = (html: string) => {
      const d = deferred<boolean>()
      calls.push({ html, d })
      return d.promise
    }
    const { unmount } = render(<PanelNotes notes="" onChange={onChange} />)
    await screen.findByTestId('editor')

    act(() => {
      emit('<p>closes 8p</p>')
      emit('<p>closes 8pm, bring old card</p>')
    })
    unmount()
    calls[0].d.resolve(true)
    await flush()
    expect(calls.map((c) => c.html)).toEqual(['<p>closes 8p</p>', '<p>closes 8pm, bring old card</p>'])
  })
})
