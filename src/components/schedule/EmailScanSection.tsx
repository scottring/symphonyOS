import { useState } from 'react'
import { Mail, Loader2, AlertCircle, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useGmailScan, type FlaggedEmail } from '@/hooks/useGmailScan'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'

interface EmailScanSectionProps {
  onTaskCreated?: () => void
}

export function EmailScanSection({ onTaskCreated }: EmailScanSectionProps) {
  const { isConnected, needsReconnect: calendarNeedsReconnect, connect } = useGoogleCalendar()
  const {
    isScanning,
    scanResult,
    error,
    needsReconnect: gmailNeedsReconnect,
    scanEmails,
    createTaskFromEmail,
    dismissEmail,
    clearResults,
  } = useGmailScan()

  const [isExpanded, setIsExpanded] = useState(true)
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null)

  const needsReconnect = calendarNeedsReconnect || gmailNeedsReconnect

  const handleCreateTask = async (email: FlaggedEmail) => {
    setCreatingTaskId(email.gmail_id)
    const taskId = await createTaskFromEmail(email)
    setCreatingTaskId(null)
    if (taskId && onTaskCreated) {
      onTaskCreated()
    }
  }

  // If not connected to Google, show connect prompt
  if (!isConnected) {
    return (
      <div className="mb-8 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-neutral-400">
            <Mail className="w-4 h-4" />
          </span>
          <h2 className="time-group-header flex items-center gap-3">
            Email Scanner
            <span className="flex-1 h-px bg-gradient-to-r from-neutral-200 to-transparent min-w-[40px]" />
          </h2>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-center">
          <p className="text-neutral-600 text-sm mb-3">
            Connect Google to scan your emails for important items
          </p>
          <button
            onClick={connect}
            className="btn-primary text-sm px-4 py-2"
          >
            Connect Google
          </button>
        </div>
      </div>
    )
  }

  // If needs reconnect (Gmail scope not granted)
  if (needsReconnect) {
    return (
      <div className="mb-8 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-amber-500">
            <AlertCircle className="w-4 h-4" />
          </span>
          <h2 className="time-group-header flex items-center gap-3">
            Email Scanner
            <span className="flex-1 h-px bg-gradient-to-r from-neutral-200 to-transparent min-w-[40px]" />
          </h2>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <p className="text-amber-800 text-sm mb-3">
            Gmail access needed. Please reconnect Google to enable email scanning.
          </p>
          <button
            onClick={connect}
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Reconnect Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8 mt-6">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-neutral-400">
          <Mail className="w-4 h-4" />
        </span>
        <h2 className="time-group-header flex items-center gap-3">
          Email Scanner
          {scanResult && scanResult.emails.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 bg-primary-100 text-primary-700 rounded-md text-xs font-semibold">
              {scanResult.emails.length}
            </span>
          )}
          <span className="flex-1 h-px bg-gradient-to-r from-neutral-200 to-transparent min-w-[40px]" />
        </h2>

        {/* Scan button */}
        <button
          onClick={scanEmails}
          disabled={isScanning}
          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 transition-colors"
        >
          {isScanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Mail className="w-4 h-4" />
              Scan Emails
            </>
          )}
        </button>
      </div>

      {/* Error state */}
      {error && !needsReconnect && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {scanResult && (
        <div className="space-y-2">
          {/* Summary header */}
          {scanResult.emails.length > 0 ? (
            <div className="flex items-center justify-between text-sm text-neutral-500 mb-3">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 hover:text-neutral-700 transition-colors"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {scanResult.emails.length} email{scanResult.emails.length !== 1 ? 's' : ''} need attention
              </button>
              <button
                onClick={clearResults}
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
              {scanResult.summary || `Scanned ${scanResult.total_scanned} emails — nothing needs attention!`}
            </div>
          )}

          {/* Email cards */}
          {isExpanded && scanResult.emails.map((email) => (
            <EmailCard
              key={email.gmail_id}
              email={email}
              onCreateTask={() => handleCreateTask(email)}
              onDismiss={() => dismissEmail(email)}
              isCreating={creatingTaskId === email.gmail_id}
            />
          ))}
        </div>
      )}

      {/* Empty state - prompt to scan */}
      {!scanResult && !isScanning && !error && (
        <div className="bg-neutral-50 border border-dashed border-neutral-300 rounded-lg p-4 text-center">
          <p className="text-neutral-500 text-sm">
            Tap "Scan Emails" to check for important messages
          </p>
        </div>
      )}
    </div>
  )
}

interface EmailCardProps {
  email: FlaggedEmail
  onCreateTask: () => void
  onDismiss: () => void
  isCreating: boolean
}

function EmailCard({ email, onCreateTask, onDismiss, isCreating }: EmailCardProps) {
  return (
    <div className={`card p-3 ${email.importance === 'high' ? 'border-l-2 border-l-amber-400' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* From + importance badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-neutral-800 truncate">
              {email.from}
            </span>
            {email.importance === 'high' && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                Urgent
              </span>
            )}
          </div>

          {/* Subject */}
          <p className="text-sm text-neutral-700 font-medium truncate mb-1">
            {email.subject}
          </p>

          {/* Snippet */}
          <p className="text-xs text-neutral-500 line-clamp-2 mb-2">
            {email.snippet}
          </p>

          {/* AI reason */}
          <p className="text-xs text-primary-600 italic">
            {email.reason}
          </p>

          {/* Suggested task title */}
          <div className="mt-2 p-2 bg-neutral-50 rounded text-sm text-neutral-700">
            <span className="text-xs text-neutral-400 uppercase tracking-wide">Suggested task:</span>
            <p className="font-medium">{email.suggested_task_title}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onCreateTask}
            disabled={isCreating}
            className="flex items-center justify-center w-8 h-8 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white rounded-lg transition-colors"
            title="Create task"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onDismiss}
            className="flex items-center justify-center w-8 h-8 bg-neutral-100 hover:bg-neutral-200 text-neutral-500 rounded-lg transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
