import { useState, useRef, useEffect } from 'react'
import type { ParsedAction, ActionRecipient } from '@/types/action'
import { getSmsSegmentInfo, SMS_LIMITS } from '@/types/action'

interface ActionPreviewProps {
  action: ParsedAction
  onSend: (finalMessage: string, recipient: ActionRecipient, subject?: string) => Promise<void>
  onCancel: () => void
  onSaveAsTask: () => void
  isSending: boolean
}

export function ActionPreview({
  action,
  onSend,
  onCancel,
  onSaveAsTask,
  isSending,
}: ActionPreviewProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // State for editable fields
  const [message, setMessage] = useState(action.draftMessage || '')
  const [subject, setSubject] = useState(action.subject || '')
  const [selectedRecipient, setSelectedRecipient] = useState<ActionRecipient | undefined>(
    action.recipient || action.possibleRecipients?.[0]
  )
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false)

  // SMS character count info
  const smsInfo = action.actionType === 'sms' ? getSmsSegmentInfo(message) : null

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onCancel])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const handleSend = async () => {
    if (!selectedRecipient || !message.trim()) return
    await onSend(message.trim(), selectedRecipient, action.actionType === 'email' ? subject : undefined)
  }

  const possibleRecipients = action.possibleRecipients || (action.recipient ? [action.recipient] : [])
  const hasMultipleRecipients = possibleRecipients.length > 1

  // Get recipient contact info based on action type
  const getRecipientContactInfo = (recipient: ActionRecipient): string => {
    if (action.actionType === 'sms') {
      return recipient.phone || 'No phone number'
    }
    return recipient.email || 'No email'
  }

  // Check if recipient has required contact info
  const recipientHasContactInfo = selectedRecipient
    ? action.actionType === 'sms'
      ? !!selectedRecipient.phone
      : !!selectedRecipient.email
    : false

  // Character count color
  const getCharCountColor = (): string => {
    if (!smsInfo) return 'text-neutral-400'
    if (smsInfo.charCount > SMS_LIMITS.SINGLE_SEGMENT) return 'text-red-500'
    if (smsInfo.charCount > SMS_LIMITS.WARNING_THRESHOLD) return 'text-amber-500'
    return 'text-green-600'
  }

  const actionIcon = action.actionType === 'sms' ? '📱' : '📧'
  const actionLabel = action.actionType === 'sms' ? 'Text' : 'Email'

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center">
      <div
        ref={modalRef}
        className="bg-white w-full sm:w-[90%] sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-auto animate-slide-in-up"
        role="dialog"
        aria-modal="true"
        aria-label={`Send ${actionLabel}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-neutral-800 flex items-center gap-2">
              <span>{actionIcon}</span>
              <span>Send {actionLabel} to {selectedRecipient?.name || 'Recipient'}</span>
            </h2>
            <button
              onClick={onCancel}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
              aria-label="Close"
              disabled={isSending}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Recipient Section */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              To
            </label>
            <div className="relative">
              <button
                onClick={() => hasMultipleRecipients && setShowRecipientDropdown(!showRecipientDropdown)}
                className={`w-full px-4 py-3 rounded-xl text-left border-2 transition-all ${
                  hasMultipleRecipients
                    ? 'border-neutral-200 hover:border-neutral-300 cursor-pointer'
                    : 'border-neutral-100 cursor-default'
                } ${!recipientHasContactInfo ? 'bg-red-50 border-red-200' : 'bg-white'}`}
                disabled={!hasMultipleRecipients}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-neutral-800">
                      {selectedRecipient?.name || 'Select recipient'}
                    </div>
                    <div className={`text-sm ${recipientHasContactInfo ? 'text-neutral-500' : 'text-red-600'}`}>
                      {selectedRecipient ? getRecipientContactInfo(selectedRecipient) : ''}
                    </div>
                  </div>
                  {hasMultipleRecipients && (
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Recipient Dropdown */}
              {showRecipientDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border-2 border-neutral-200 shadow-lg z-10 overflow-hidden">
                  {possibleRecipients.map((recipient, index) => (
                    <button
                      key={recipient.contactId || index}
                      onClick={() => {
                        setSelectedRecipient(recipient)
                        setShowRecipientDropdown(false)
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${
                        selectedRecipient?.contactId === recipient.contactId ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div className="font-medium text-neutral-800">{recipient.name}</div>
                      <div className="text-sm text-neutral-500">{getRecipientContactInfo(recipient)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!recipientHasContactInfo && selectedRecipient && (
              <p className="mt-2 text-sm text-red-600">
                {selectedRecipient.name} has no {action.actionType === 'sms' ? 'phone number' : 'email address'}.
              </p>
            )}
          </div>

          {/* Subject (Email only) */}
          {action.actionType === 'email' && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject..."
                className="w-full px-4 py-3 rounded-xl border-2 border-neutral-200 focus:border-primary-300 focus:ring-0 transition-colors"
                disabled={isSending}
              />
            </div>
          )}

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Message
              </label>
              {smsInfo && (
                <span className={`text-xs font-medium ${getCharCountColor()}`}>
                  {smsInfo.charCount}/{SMS_LIMITS.SINGLE_SEGMENT}
                  {smsInfo.isMultiSegment && (
                    <span className="text-neutral-400 ml-1">
                      ({smsInfo.segmentCount} segments)
                    </span>
                  )}
                </span>
              )}
              {action.actionType === 'email' && (
                <span className="text-xs text-neutral-400">
                  {message.length} characters
                </span>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              rows={action.actionType === 'sms' ? 3 : 6}
              className="w-full px-4 py-3 rounded-xl border-2 border-neutral-200 focus:border-primary-300 focus:ring-0 transition-colors resize-none"
              disabled={isSending}
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 rounded-xl">
            <span className="text-amber-600 text-lg">⚠️</span>
            <p className="text-sm text-amber-800">
              This will send a real {action.actionType === 'sms' ? 'text message' : 'email'} to{' '}
              {selectedRecipient?.name || 'the recipient'}.
            </p>
          </div>

          {/* Confidence indicator (debug) */}
          {action.confidence < 0.7 && (
            <div className="flex items-start gap-2 px-4 py-3 bg-neutral-100 rounded-xl">
              <span className="text-neutral-500 text-lg">🤖</span>
              <p className="text-sm text-neutral-600">
                AI confidence: {Math.round(action.confidence * 100)}%
                {action.reasoning && ` - ${action.reasoning}`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onSaveAsTask}
              className="px-4 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-xl transition-colors"
              disabled={isSending}
            >
              Save as Task
            </button>
            <div className="flex-1" />
            <button
              onClick={onCancel}
              className="px-4 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-xl transition-colors"
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || !message.trim() || !recipientHasContactInfo}
              className="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  Send
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
