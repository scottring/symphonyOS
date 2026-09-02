import { useState } from 'react'
import { Check, Copy, Mail, RefreshCw } from 'lucide-react'
import { useSchoolMail } from '@/hooks/useSchoolMail'

/** "2h ago" / "3d ago" / a date once it stops being recent. */
function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const STATUS_STYLES: Record<string, string> = {
  extracted: 'bg-primary-50 text-primary-700',
  pending: 'bg-neutral-100 text-neutral-500',
  failed: 'bg-red-50 text-red-600',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {status}
    </span>
  )
}

export function SchoolMailCard() {
  const { address, recent, retry, loading, error } = useSchoolMail()
  const [copied, setCopied] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Could not copy the school mail address:', err)
    }
  }

  const handleRetry = async (id: string) => {
    setRetrying(id)
    try {
      await retry(id)
    } finally {
      setRetrying(null)
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">School mail</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Forward school email here once, or set a Gmail filter. Events land on their day with what
        each kid needs.
      </p>

      {address && (
        <div className="p-4 bg-white rounded-lg border border-neutral-100">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-neutral-400 shrink-0" />
            <span className="font-mono text-sm text-neutral-700 break-all flex-1">{address}</span>
            <button
              onClick={handleCopy}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50 transition-colors whitespace-nowrap flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-neutral-400 mt-3">Treat this address like a password.</p>
        </div>
      )}

      {/* No address and nothing still in flight means no household — and the
          address is minted per household, so there is a concrete next step
          rather than an empty card. */}
      {!address && !loading && (
        <p className="text-sm text-neutral-500">
          Join or create a household to get a forwarding address.
        </p>
      )}

      <div className="mt-4">
        <label className="block text-sm text-neutral-500 mb-2">Recent</label>
        {loading ? (
          // A skeleton, not "No email has arrived yet" — a load in flight and a
          // genuinely empty list are different things, and saying the second
          // while the first is true is simply wrong.
          <div
            data-testid="school-mail-skeleton"
            aria-hidden
            className="h-12 rounded-lg bg-neutral-100 animate-pulse"
          />
        ) : recent.length === 0 ? (
          <p className="text-xs text-neutral-400">No email has arrived yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((capture) => (
              <div
                key={capture.id}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-700 truncate">{capture.subject ?? 'No subject'}</p>
                  <p className="text-xs text-neutral-400 truncate">
                    {[capture.sourceLabel, relativeTime(capture.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                  {capture.status === 'failed' && capture.error && (
                    <p className="text-xs text-red-500 truncate">{capture.error}</p>
                  )}
                </div>
                <StatusPill status={capture.status} />
                {capture.status === 'failed' && (
                  <button
                    onClick={() => handleRetry(capture.id)}
                    disabled={retrying === capture.id}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50 transition-colors whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${retrying === capture.id ? 'animate-spin' : ''}`} />
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* The hook's own failure — a load that never landed, or a retry that
            was refused. Quiet: one line, no banner, no retry button of its
            own (opening Settings again re-runs the load). */}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    </section>
  )
}
