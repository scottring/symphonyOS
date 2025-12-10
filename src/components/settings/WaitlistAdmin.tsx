import { useWaitlist, type WaitlistStatus } from '@/hooks/useWaitlist'

const STATUS_CONFIG: Record<WaitlistStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-100', text: 'text-amber-700' },
  invited: { label: 'Invited', bg: 'bg-blue-100', text: 'text-blue-700' },
  converted: { label: 'Converted', bg: 'bg-green-100', text: 'text-green-700' },
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function WaitlistAdmin() {
  const { entries, loading, error, updateStatus, deleteEntry } = useWaitlist()

  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg border border-neutral-100">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-neutral-200 rounded w-1/4" />
          <div className="h-10 bg-neutral-100 rounded" />
          <div className="h-10 bg-neutral-100 rounded" />
          <div className="h-10 bg-neutral-100 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-red-700">
        Error loading waitlist: {error}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="p-6 bg-white rounded-lg border border-neutral-100 text-center">
        <p className="text-neutral-500">No waitlist signups yet</p>
      </div>
    )
  }

  const counts = {
    total: entries.length,
    pending: entries.filter(e => e.status === 'pending').length,
    invited: entries.filter(e => e.status === 'invited').length,
    converted: entries.filter(e => e.status === 'converted').length,
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <div className="px-3 py-2 bg-neutral-100 rounded-lg">
          <span className="font-medium">{counts.total}</span>
          <span className="text-neutral-500 ml-1">total</span>
        </div>
        <div className="px-3 py-2 bg-amber-50 rounded-lg">
          <span className="font-medium text-amber-700">{counts.pending}</span>
          <span className="text-amber-600 ml-1">pending</span>
        </div>
        <div className="px-3 py-2 bg-blue-50 rounded-lg">
          <span className="font-medium text-blue-700">{counts.invited}</span>
          <span className="text-blue-600 ml-1">invited</span>
        </div>
        <div className="px-3 py-2 bg-green-50 rounded-lg">
          <span className="font-medium text-green-700">{counts.converted}</span>
          <span className="text-green-600 ml-1">converted</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-neutral-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <th className="text-left px-4 py-3 font-medium text-neutral-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600">Signed Up</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600">Source</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const statusConfig = STATUS_CONFIG[entry.status]
              return (
                <tr key={entry.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <a
                      href={`mailto:${entry.email}`}
                      className="text-primary-600 hover:underline"
                    >
                      {entry.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {entry.source}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={entry.status}
                      onChange={(e) => updateStatus(entry.id, e.target.value as WaitlistStatus)}
                      className={`px-2 py-1 rounded-md text-xs font-medium ${statusConfig.bg} ${statusConfig.text} border-0 cursor-pointer`}
                    >
                      <option value="pending">Pending</option>
                      <option value="invited">Invited</option>
                      <option value="converted">Converted</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${entry.email} from waitlist?`)) {
                          deleteEntry(entry.id)
                        }
                      }}
                      className="text-neutral-400 hover:text-red-500 p-1"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
