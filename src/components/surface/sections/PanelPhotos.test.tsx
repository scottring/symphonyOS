import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { PanelPhotos } from './PanelPhotos'

const listAttachments = vi.fn()
const attachFile = vi.fn()
const deleteAttachment = vi.fn()

vi.mock('@/lib/taskAttachments', () => ({
  listAttachments: (...args: unknown[]) => listAttachments(...args),
  attachFile: (...args: unknown[]) => attachFile(...args),
  deleteAttachment: (...args: unknown[]) => deleteAttachment(...args),
  ATTACHMENT_ACCEPT: 'image/*,application/pdf',
}))

describe('PanelPhotos', () => {
  beforeEach(() => {
    listAttachments.mockReset().mockResolvedValue([])
    attachFile.mockReset().mockResolvedValue(true)
    deleteAttachment.mockReset().mockResolvedValue(true)
  })

  it('lists attachments for the given entity', async () => {
    render(<PanelPhotos entityType="event_note" entityId="gcal-abc123" />)
    await waitFor(() => expect(listAttachments).toHaveBeenCalledWith('event_note', 'gcal-abc123'))
  })

  it('renders image attachments as thumbnails', async () => {
    listAttachments.mockResolvedValue([
      { id: '1', fileName: 'fixture.jpg', fileType: 'image/jpeg', url: 'https://signed/fixture.jpg' },
    ])
    render(<PanelPhotos entityType="task" entityId="t1" />)
    await waitFor(() => expect(screen.getByAltText('fixture.jpg')).toBeInTheDocument())
  })

  it('renders document attachments as file chips (not thumbnails)', async () => {
    listAttachments.mockResolvedValue([
      { id: '2', fileName: 'permission-slip.pdf', fileType: 'application/pdf', url: 'https://signed/slip.pdf' },
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
      { id: 'a1', fileName: 'fixture.jpg', fileType: 'image/jpeg', url: 'https://signed/fixture.jpg' },
    ])
    const { user } = render(<PanelPhotos entityType="task" entityId="t1" />)
    await waitFor(() => expect(screen.getByAltText('fixture.jpg')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Remove fixture.jpg' }))
    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith('a1'))
    expect(listAttachments.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('offers a ✕ on document chips too', async () => {
    listAttachments.mockResolvedValue([
      { id: 'a2', fileName: 'slip.pdf', fileType: 'application/pdf', url: 'https://signed/slip.pdf' },
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
