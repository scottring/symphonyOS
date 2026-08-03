import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef } from 'react'
import { render, screen, waitFor } from '@/test/test-utils'
import { PanelPhotos } from './PanelPhotos'

const listAttachments = vi.fn()
const attachFile = vi.fn()
const deleteAttachment = vi.fn()
const analyzeAttachment = vi.fn()

vi.mock('@/lib/taskAttachments', () => ({
  listAttachments: (...args: unknown[]) => listAttachments(...args),
  attachFile: (...args: unknown[]) => attachFile(...args),
  deleteAttachment: (...args: unknown[]) => deleteAttachment(...args),
  analyzeAttachment: (...args: unknown[]) => analyzeAttachment(...args),
  ATTACHMENT_ACCEPT: 'image/*,application/pdf',
}))

describe('PanelPhotos', () => {
  beforeEach(() => {
    listAttachments.mockReset().mockResolvedValue([])
    attachFile.mockReset().mockResolvedValue({ id: 'att-1', contentType: 'image/jpeg' })
    analyzeAttachment.mockReset().mockResolvedValue(true)
    deleteAttachment.mockReset().mockResolvedValue(true)
  })

  it('lists attachments for the given entity', async () => {
    render(<PanelPhotos entityType="event_note" entityId="gcal-abc123" />)
    await waitFor(() => expect(listAttachments).toHaveBeenCalledWith('event_note', 'gcal-abc123'))
  })

  it('renders image attachments as thumbnails', async () => {
    listAttachments.mockResolvedValue([
      { id: '1', fileName: 'fixture.jpg', fileType: 'image/jpeg', url: 'https://signed/fixture.jpg', facets: [], analyzedAt: null },
    ])
    render(<PanelPhotos entityType="task" entityId="t1" />)
    await waitFor(() => expect(screen.getByAltText('fixture.jpg')).toBeInTheDocument())
  })

  it('renders document attachments as file chips (not thumbnails)', async () => {
    listAttachments.mockResolvedValue([
      { id: '2', fileName: 'permission-slip.pdf', fileType: 'application/pdf', url: 'https://signed/slip.pdf', facets: [], analyzedAt: null },
    ])
    render(<PanelPhotos entityType="event_note" entityId="e1" />)
    await waitFor(() => expect(screen.getByText('permission-slip.pdf')).toBeInTheDocument())
    expect(screen.queryByAltText('permission-slip.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('permission-slip.pdf').closest('a')).toHaveAttribute('href', 'https://signed/slip.pdf')
  })

  it('accepts documents as well as images in the file picker', () => {
    const { container } = render(<PanelPhotos entityType="task" entityId="t1" />)
    const input = container.querySelector('input[type="file"]')
    expect(input?.getAttribute('accept')).toContain('image/*')
    expect(input?.getAttribute('accept')).toContain('application/pdf')
  })

  it('removes an attachment via its ✕ button and reloads', async () => {
    listAttachments.mockResolvedValue([
      { id: 'a1', fileName: 'fixture.jpg', fileType: 'image/jpeg', url: 'https://signed/fixture.jpg', facets: [], analyzedAt: null },
    ])
    const { user } = render(<PanelPhotos entityType="task" entityId="t1" />)
    await waitFor(() => expect(screen.getByAltText('fixture.jpg')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Remove fixture.jpg' }))
    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith('a1'))
    expect(listAttachments.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('offers a ✕ on document chips too', async () => {
    listAttachments.mockResolvedValue([
      { id: 'a2', fileName: 'slip.pdf', fileType: 'application/pdf', url: 'https://signed/slip.pdf', facets: [], analyzedAt: null },
    ])
    const { user } = render(<PanelPhotos entityType="event_note" entityId="e1" />)
    await waitFor(() => expect(screen.getByText('slip.pdf')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Remove slip.pdf' }))
    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith('a2'))
  })

  it('attaches a clipboard image via the Paste button', async () => {
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    const clipboardItem = { types: ['image/png'], getType: vi.fn().mockResolvedValue(blob) }

    const { user } = render(<PanelPhotos entityType="event_note" entityId="e1" />)
    // userEvent installs its own navigator.clipboard stub at setup — spy on that.
    vi.spyOn(navigator.clipboard, 'read').mockResolvedValue([clipboardItem as unknown as ClipboardItem])
    await user.click(screen.getByRole('button', { name: /paste/i }))
    await waitFor(() =>
      expect(attachFile).toHaveBeenCalledWith('event_note', 'e1', blob, expect.stringMatching(/^pasted-.*\.png$/)),
    )
  })

  it('auto-analyzes an attached image with the entity context', async () => {
    const { container } = render(
      <PanelPhotos entityType="event_note" entityId="e1" entityContext="Birthday party — Sat 2pm" />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'invite.png', { type: 'image/png' })
    await waitFor(() => expect(listAttachments).toHaveBeenCalled())
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => expect(analyzeAttachment).toHaveBeenCalledWith('att-1', 'Birthday party — Sat 2pm'))
  })

  it('does not analyze a csv attachment', async () => {
    attachFile.mockResolvedValue({ id: 'att-2', contentType: 'text/csv' })
    const { container } = render(<PanelPhotos entityType="task" entityId="t1" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await waitFor(() => expect(listAttachments).toHaveBeenCalled())
    Object.defineProperty(input, 'files', { value: [new File(['a,b'], 'data.csv', { type: 'text/csv' })] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => expect(attachFile).toHaveBeenCalled())
    expect(analyzeAttachment).not.toHaveBeenCalled()
  })

  it('renders facets under an attachment', async () => {
    listAttachments.mockResolvedValue([{
      id: 'a1', fileName: 'x.jpg', fileType: 'image/jpeg', url: 'https://signed/x.jpg',
      facets: [{ type: 'access_code', label: 'Door code', code: '4482#' }], analyzedAt: '2026-07-14T00:00:00Z',
    }])
    render(<PanelPhotos entityType="event_note" entityId="e1" />)
    await waitFor(() => expect(screen.getByText('4482#')).toBeInTheDocument())
  })

  it('points at ⌘V/drag when the clipboard holds a file reference (empty types)', async () => {
    // A screenshot FILE copied in Finder surfaces as one ClipboardItem with no
    // web-readable types — the async API can't see file contents.
    const fileRefItem = { types: [] as string[], getType: vi.fn() }
    const { user } = render(<PanelPhotos entityType="event_note" entityId="e1" />)
    vi.spyOn(navigator.clipboard, 'read').mockResolvedValue([fileRefItem as unknown as ClipboardItem])
    await user.click(screen.getByRole('button', { name: /paste/i }))
    await waitFor(() =>
      expect(screen.getByText(/copied file/i)).toBeInTheDocument(),
    )
    expect(attachFile).not.toHaveBeenCalled()
  })

  it('attaches files dropped onto the section', async () => {
    const { container } = render(<PanelPhotos entityType="event_note" entityId="e1" />)
    const section = container.querySelector('section') as HTMLElement
    const file = new File(['png'], 'shot.png', { type: 'image/png' })
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as unknown as { dataTransfer: unknown }
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file], types: ['Files'] } })
    section.dispatchEvent(drop as unknown as Event)
    await waitFor(() => expect(attachFile).toHaveBeenCalledWith('event_note', 'e1', file, 'shot.png'))
  })

  it('attaches files dropped anywhere in the panel, not just on the section', async () => {
    // The section is ~16% of a 1237px panel; everywhere else the browser's
    // default fires and navigates the tab to the PDF. Given a panel-level drop
    // zone, a drop far from the section must still attach.
    function Host() {
      const ref = useRef<HTMLDivElement>(null)
      return (
        <div ref={ref} data-testid="panel">
          <div data-testid="far-from-section">links, notes, etc.</div>
          <PanelPhotos entityType="task" entityId="t1" dropZoneRef={ref} />
        </div>
      )
    }
    render(<Host />)
    await waitFor(() => expect(listAttachments).toHaveBeenCalled())

    const far = screen.getByTestId('far-from-section')
    const pdf = new File(['%PDF'], 'permission-slip.pdf', { type: 'application/pdf' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [pdf], types: ['Files'] } })
    far.dispatchEvent(drop)

    await waitFor(() =>
      expect(attachFile).toHaveBeenCalledWith('task', 't1', pdf, 'permission-slip.pdf'),
    )
  })

  it('ignores a non-file drag (an internal item drag crossing the panel)', async () => {
    function Host() {
      const ref = useRef<HTMLDivElement>(null)
      return (
        <div ref={ref} data-testid="panel">
          <PanelPhotos entityType="task" entityId="t1" dropZoneRef={ref} />
        </div>
      )
    }
    render(<Host />)
    await waitFor(() => expect(listAttachments).toHaveBeenCalled())

    const panel = screen.getByTestId('panel')
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [], types: ['text/plain'] } })
    panel.dispatchEvent(drop)

    await new Promise((r) => setTimeout(r, 10))
    expect(attachFile).not.toHaveBeenCalled()
  })

  it('⌘V paste accepts a non-image file (copied PDF) too', async () => {
    render(<PanelPhotos entityType="task" entityId="t1" />)
    const pdf = new File(['%PDF'], 'slip.pdf', { type: 'application/pdf' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: { items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => pdf }], files: [pdf] },
    })
    document.dispatchEvent(paste)
    await waitFor(() => expect(attachFile).toHaveBeenCalledWith('task', 't1', pdf, 'slip.pdf'))
  })

  it('attaches a picked file to the entity', async () => {
    const { container } = render(<PanelPhotos entityType="event_note" entityId="gcal-1" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' })
    await waitFor(() => expect(listAttachments).toHaveBeenCalled())
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => expect(attachFile).toHaveBeenCalledWith('event_note', 'gcal-1', file, 'doc.pdf'))
  })
})
