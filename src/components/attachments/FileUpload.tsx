import { useRef, useState, useCallback } from 'react'
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE, formatFileSize } from '@/types/attachment'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  isUploading?: boolean
  error?: string | null
  compact?: boolean
}

export function FileUpload({ onFileSelect, isUploading = false, error, compact = false }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
      return 'File type not supported'
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (max ${formatFileSize(MAX_FILE_SIZE)})`
    }
    return null
  }, [])

  const handleFile = useCallback(
    (file: File) => {
      const error = validateFile(file)
      if (error) {
        setValidationError(error)
        return
      }
      setValidationError(null)
      onFileSelect(file)
    },
    [onFileSelect, validateFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFile(files[0])
      }
    },
    [handleFile]
  )

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFile(files[0])
      }
      // Reset input so same file can be selected again
      e.target.value = ''
    },
    [handleFile]
  )

  const displayError = error || validationError

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_FILE_TYPES.join(',')}
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
        <button
          type="button"
          onClick={handleClick}
          disabled={isUploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600
                     bg-neutral-100 rounded-lg hover:bg-neutral-200 active:bg-neutral-300
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isUploading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Attach file</span>
            </>
          )}
        </button>
        {displayError && <span className="text-xs text-red-500">{displayError}</span>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_FILE_TYPES.join(',')}
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading}
      />
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed
          cursor-pointer transition-colors
          ${isDragging
            ? 'border-primary-400 bg-primary-50'
            : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100'
          }
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {isUploading ? (
          <>
            <svg className="w-8 h-8 text-neutral-400 animate-spin mb-2" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm text-neutral-500">Uploading...</span>
          </>
        ) : (
          <>
            <svg className="w-8 h-8 text-neutral-400 mb-2" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium text-neutral-600">
              {isDragging ? 'Drop file here' : 'Click or drag to upload'}
            </span>
            <span className="text-xs text-neutral-400 mt-1">
              Max {formatFileSize(MAX_FILE_SIZE)}
            </span>
          </>
        )}
      </div>
      {displayError && (
        <p className="text-sm text-red-500">{displayError}</p>
      )}
    </div>
  )
}
