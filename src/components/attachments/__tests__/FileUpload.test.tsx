import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileUpload } from '../FileUpload'

// Helper to create a mock File
function createMockFile(name: string, type: string, size: number = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type })
  return new File([blob], name, { type })
}

// Helper to create a DataTransfer with files
function createDataTransferWithFile(file: File): DataTransfer {
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)
  return dataTransfer
}

describe('FileUpload', () => {
  const mockOnFileSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders upload zone with drop area', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      expect(screen.getByText('Click or drag to upload')).toBeInTheDocument()
      expect(screen.getByText(/Max/)).toBeInTheDocument()
    })

    it('renders compact mode correctly', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} compact />)

      expect(screen.getByText('Attach file')).toBeInTheDocument()
      expect(screen.queryByText('Click or drag to upload')).not.toBeInTheDocument()
    })

    it('shows loading state during upload', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} isUploading />)

      expect(screen.getByText('Uploading...')).toBeInTheDocument()
    })

    it('shows loading state in compact mode during upload', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} isUploading compact />)

      expect(screen.getByText('Uploading...')).toBeInTheDocument()
    })
  })

  describe('file selection', () => {
    it('opens file picker on click', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const dropZone = screen.getByText('Click or drag to upload').closest('div')
      expect(dropZone).toBeInTheDocument()

      // File input should exist but be hidden
      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveClass('hidden')
    })

    it('calls onFileSelect with file when selected via picker', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const validFile = createMockFile('test.pdf', 'application/pdf')

      fireEvent.change(fileInput, { target: { files: [validFile] } })

      expect(mockOnFileSelect).toHaveBeenCalledWith(validFile)
    })

    it('calls onFileSelect in compact mode', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} compact />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const validFile = createMockFile('test.pdf', 'application/pdf')

      fireEvent.change(fileInput, { target: { files: [validFile] } })

      expect(mockOnFileSelect).toHaveBeenCalledWith(validFile)
    })
  })

  describe('drag and drop', () => {
    it('shows drag-over state when file dragged over', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const dropZone = screen.getByText('Click or drag to upload').closest('div')!

      fireEvent.dragOver(dropZone)

      expect(screen.getByText('Drop file here')).toBeInTheDocument()
    })

    it('calls onFileSelect with file when dropped', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const dropZone = screen.getByText('Click or drag to upload').closest('div')!
      const validFile = createMockFile('test.pdf', 'application/pdf')
      const dataTransfer = createDataTransferWithFile(validFile)

      fireEvent.drop(dropZone, { dataTransfer })

      expect(mockOnFileSelect).toHaveBeenCalledWith(validFile)
    })

    it('resets drag state when file leaves', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const dropZone = screen.getByText('Click or drag to upload').closest('div')!

      // Drag over
      fireEvent.dragOver(dropZone)
      expect(screen.getByText('Drop file here')).toBeInTheDocument()

      // Drag leave
      fireEvent.dragLeave(dropZone)
      expect(screen.getByText('Click or drag to upload')).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('accepts valid file types (png, jpg, pdf, etc.)', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

      // Test PDF
      const pdfFile = createMockFile('test.pdf', 'application/pdf')
      fireEvent.change(fileInput, { target: { files: [pdfFile] } })
      expect(mockOnFileSelect).toHaveBeenCalledWith(pdfFile)

      mockOnFileSelect.mockClear()

      // Test PNG
      const pngFile = createMockFile('test.png', 'image/png')
      fireEvent.change(fileInput, { target: { files: [pngFile] } })
      expect(mockOnFileSelect).toHaveBeenCalledWith(pngFile)

      mockOnFileSelect.mockClear()

      // Test JPEG
      const jpegFile = createMockFile('test.jpg', 'image/jpeg')
      fireEvent.change(fileInput, { target: { files: [jpegFile] } })
      expect(mockOnFileSelect).toHaveBeenCalledWith(jpegFile)
    })

    it('rejects invalid file types', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const invalidFile = createMockFile('test.exe', 'application/x-msdownload')

      fireEvent.change(fileInput, { target: { files: [invalidFile] } })

      expect(mockOnFileSelect).not.toHaveBeenCalled()
    })

    it('shows error message for invalid file type', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const invalidFile = createMockFile('test.exe', 'application/x-msdownload')

      fireEvent.change(fileInput, { target: { files: [invalidFile] } })

      expect(screen.getByText('File type not supported')).toBeInTheDocument()
    })

    it('rejects files over MAX_FILE_SIZE', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      // Create a file larger than 50MB
      const largeFile = createMockFile('large.pdf', 'application/pdf', 60 * 1024 * 1024)

      fireEvent.change(fileInput, { target: { files: [largeFile] } })

      expect(mockOnFileSelect).not.toHaveBeenCalled()
    })

    it('shows error message for oversized files', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const largeFile = createMockFile('large.pdf', 'application/pdf', 60 * 1024 * 1024)

      fireEvent.change(fileInput, { target: { files: [largeFile] } })

      expect(screen.getByText(/File too large/)).toBeInTheDocument()
    })

    it('shows external error prop', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} error="Upload failed" />)

      expect(screen.getByText('Upload failed')).toBeInTheDocument()
    })

    it('shows external error in compact mode', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} error="Upload failed" compact />)

      expect(screen.getByText('Upload failed')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has accessible button/input', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />)

      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveAttribute('accept')
    })

    it('button in compact mode is accessible', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} compact />)

      const button = screen.getByRole('button', { name: /Attach file/i })
      expect(button).toBeInTheDocument()
      expect(button).not.toBeDisabled()
    })

    it('disables input when uploading', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} isUploading />)

      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeDisabled()
    })

    it('disables button in compact mode when uploading', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} isUploading compact />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })
  })
})
