import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineNoteComposer } from './TimelineNoteComposer'

const anchor = new Date(2026,4,18,18,15)

describe('TimelineNoteComposer', () => {
  it('new-note mode creates a note with the anchor', () => {
    const onCreate = vi.fn()
    render(<TimelineNoteComposer anchor={anchor} existingNotes={[]} onCreateNew={onCreate} onAppendExisting={vi.fn()} onLinkExisting={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/write a note/i), { target: { value: 'check sprinklers' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))
    expect(onCreate).toHaveBeenCalledWith('check sprinklers', anchor)
  })
  it('link-existing → append calls onAppendExisting with note id + anchor', () => {
    const onAppend = vi.fn()
    render(<TimelineNoteComposer anchor={anchor}
      existingNotes={[{ id: 'n1', title: 'Garden', content: '' } as any]}
      onCreateNew={vi.fn()} onAppendExisting={onAppend} onLinkExisting={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /link existing/i }))
    fireEvent.click(screen.getByRole('button', { name: /garden/i }))
    fireEvent.change(screen.getByPlaceholderText(/append/i), { target: { value: 'water tonight' } })
    fireEvent.click(screen.getByRole('button', { name: /^append$/i }))
    expect(onAppend).toHaveBeenCalledWith('n1', 'water tonight', anchor)
  })
})
