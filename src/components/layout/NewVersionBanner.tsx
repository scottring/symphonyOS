import { RefreshCw } from 'lucide-react'
import { useNewVersionAvailable } from '@/hooks/useNewVersionAvailable'

/**
 * Thin top banner shown when a newer build has deployed while this tab stayed
 * open. Tapping Reload reloads the page, which fetches the fresh (no-cache)
 * index.html and the new hashed bundles — ending the "stale tab runs old code"
 * problem behind recurring "fixed but still broken" reports.
 */
export function NewVersionBanner() {
  const available = useNewVersionAvailable()
  if (!available) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-primary-600 px-4 py-2 text-white shadow-md"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      <span className="text-sm font-medium">A new version of Symphony is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold transition-colors hover:bg-white/25"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reload
      </button>
    </div>
  )
}
