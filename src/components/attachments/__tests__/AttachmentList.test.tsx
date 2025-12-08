import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AttachmentList } from '../AttachmentList'
import type { Attachment } from '@/types/attachment'

// Helper to create a mock Attachment
function createMockAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'attachment-1',
    entityType: 'task',
    entityId: 'task-1',
    fileName: 'test-file.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    storagePath: 'user-1/task/task-1/test-file.pdf',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('AttachmentList', () => {
  const mockOnDelete = vi.fn().mockResolvedValue(undefined)
  const mockOnOpen = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders list of attachments', () => {
      const attachments = [
        createMockAttachment({ id: '1', fileName: 'file1.pdf' }),
        createMockAttachment({ id: '2', fileName: 'file2.pdf' }),
      ]

      render(
        <AttachmentList
          attachments={attachments}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      expect(screen.getByText('file1.pdf')).toBeInTheDocument()
      expect(screen.getByText('file2.pdf')).toBeInTheDocument()
    })

    it('renders empty state when no attachments', () => {
      const { container } = render(
        <AttachmentList
          attachments={[]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      // Returns null when empty
      expect(container.firstChild).toBeNull()
    })

    it('displays file name', () => {
      const attachment = createMockAttachment({ fileName: 'important-document.pdf' })

      render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      expect(screen.getByText('important-document.pdf')).toBeInTheDocument()
    })

    it('displays formatted file size', () => {
      const attachment = createMockAttachment({ fileSize: 2048 }) // 2 KB

      render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      expect(screen.getByText('2 KB')).toBeInTheDocument()
    })
  })

  describe('file type icons', () => {
    it('shows correct icon for image files', () => {
      const attachment = createMockAttachment({
        fileName: 'photo.png',
        fileType: 'image/png',
      })

      const { container } = render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      // Check for purple color class used for images
      const iconWrapper = container.querySelector('.bg-purple-100')
      expect(iconWrapper).toBeInTheDocument()
    })

    it('shows correct icon for PDF files', () => {
      const attachment = createMockAttachment({
        fileName: 'document.pdf',
        fileType: 'application/pdf',
      })

      const { container } = render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      // Check for blue color class used for documents
      const iconWrapper = container.querySelector('.bg-blue-100')
      expect(iconWrapper).toBeInTheDocument()
    })

    it('shows correct icon for document files (docx)', () => {
      const attachment = createMockAttachment({
        fileName: 'report.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

      const { container } = render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      // Documents use blue
      const iconWrapper = container.querySelector('.bg-blue-100')
      expect(iconWrapper).toBeInTheDocument()
    })

    it('shows correct icon for spreadsheet files (xlsx)', () => {
      const attachment = createMockAttachment({
        fileName: 'data.xlsx',
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const { container } = render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      // Spreadsheets use green
      const iconWrapper = container.querySelector('.bg-green-100')
      expect(iconWrapper).toBeInTheDocument()
    })

    it('shows correct icon for audio files (mp3)', () => {
      const attachment = createMockAttachment({
        fileName: 'song.mp3',
        fileType: 'audio/mpeg',
      })

      const { container } = render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      // Audio uses amber
      const iconWrapper = container.querySelector('.bg-amber-100')
      expect(iconWrapper).toBeInTheDocument()
    })

    it('shows correct icon for text/csv files', () => {
      const attachment = createMockAttachment({
        fileName: 'data.csv',
        fileType: 'text/csv',
      })

      const { container } = render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      // CSV is categorized as spreadsheet (green)
      const iconWrapper = container.querySelector('.bg-green-100')
      expect(iconWrapper).toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('calls onOpen when attachment row clicked', () => {
      const attachment = createMockAttachment()

      render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      const row = screen.getByText('test-file.pdf').closest('li')!
      fireEvent.click(row)

      expect(mockOnOpen).toHaveBeenCalledWith(attachment)
    })

    it('calls onDelete when delete button clicked', async () => {
      const attachment = createMockAttachment()

      render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      const deleteButton = screen.getByRole('button', { name: /Delete test-file.pdf/i })
      fireEvent.click(deleteButton)

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith(attachment)
      })
    })

    it('shows loading state during delete', async () => {
      // Create a mock that doesn't resolve immediately
      const slowDelete = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      const attachment = createMockAttachment()

      render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={slowDelete}
          onOpen={mockOnOpen}
        />
      )

      const deleteButton = screen.getByRole('button', { name: /Delete test-file.pdf/i })
      fireEvent.click(deleteButton)

      // Button should show spinner (has animate-spin class)
      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin')
        expect(spinner).toBeInTheDocument()
      })
    })

    it('delete button stops event propagation', async () => {
      const attachment = createMockAttachment()

      render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      const deleteButton = screen.getByRole('button', { name: /Delete test-file.pdf/i })
      fireEvent.click(deleteButton)

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalled()
      })

      // onOpen should NOT have been called
      expect(mockOnOpen).not.toHaveBeenCalled()
    })
  })

  describe('loading states', () => {
    it('shows opacity when isDeleting prop is true', () => {
      const attachment = createMockAttachment()

      const { container } = render(
        <AttachmentList
          attachments={[attachment]}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
          isDeleting
        />
      )

      const row = container.querySelector('li')
      expect(row).toHaveClass('opacity-50')
    })
  })

  describe('accessibility', () => {
    it('has accessible delete buttons with labels', () => {
      const attachments = [
        createMockAttachment({ id: '1', fileName: 'file1.pdf' }),
        createMockAttachment({ id: '2', fileName: 'file2.docx' }),
      ]

      render(
        <AttachmentList
          attachments={attachments}
          onDelete={mockOnDelete}
          onOpen={mockOnOpen}
        />
      )

      expect(screen.getByRole('button', { name: 'Delete file1.pdf' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete file2.docx' })).toBeInTheDocument()
    })
  })
})
