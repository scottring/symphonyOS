import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { PanelPhotos } from './PanelPhotos'

const listAttachments = vi.fn()
const attachFile = vi.fn()

vi.mock('@/lib/taskAttachments', () => ({
  listAttachments: (...args: unknown[]) => listAttachments(...args),
  attachFile: (...args: unknown[]) => attachFile(...args),
  ATTACHMENT_ACCEPT: 'image/*,application/pdf',
}))

describe('PanelPhotos', () => {
  beforeEach(() => {
    listAttachments.mockReset().mockResolvedValue([])
    attachFile.mockReset().mockResolvedValue(true)
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
