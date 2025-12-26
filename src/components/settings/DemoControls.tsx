import { useState } from 'react'
import { resetDemo, loadDemoData, clearDemoData } from '@/lib/demoData'

export function DemoControls() {
  const [isResetting, setIsResetting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showConfirm, setShowConfirm] = useState<'reset' | 'clear' | null>(null)

  const handleReset = async () => {
    setIsResetting(true)
    setMessage(null)
    setShowConfirm(null)

    const result = await resetDemo()

    setIsResetting(false)

    if (result.success) {
      setMessage({ type: 'success', text: '✓ Demo reset complete! Ready to present.' })
      setTimeout(() => setMessage(null), 5000)
    } else {
      setMessage({ type: 'error', text: `Error: ${result.message}` })
    }
  }

  const handleLoad = async () => {
    setIsLoading(true)
    setMessage(null)

    const result = await loadDemoData()

    setIsLoading(false)

    if (result.success) {
      setMessage({ type: 'success', text: '✓ Demo data loaded successfully' })
      setTimeout(() => setMessage(null), 5000)
    } else {
      setMessage({ type: 'error', text: `Error: ${result.message}` })
    }
  }

  const handleClear = async () => {
    setIsClearing(true)
    setMessage(null)
    setShowConfirm(null)

    const result = await clearDemoData()

    setIsClearing(false)

    if (result.success) {
      setMessage({ type: 'success', text: '✓ Demo data cleared' })
      setTimeout(() => setMessage(null), 5000)
    } else {
      setMessage({ type: 'error', text: `Error: ${result.message}` })
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">⚠️ Demo Account Setup</h3>
        <div className="text-sm text-amber-700 space-y-2">
          <p>
            <strong>Demo persona:</strong> Alex Chen, freelance consultant with 2 kids
          </p>
          <p>
            <strong>Google account:</strong> symphonygoals@gmail.com (for calendar integration)
          </p>
          <p className="text-xs mt-3 text-amber-600">
            Note: Calendar events must be created manually in Google Calendar. Demo data only includes contacts, projects, and tasks.
          </p>
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Demo Data Overview */}
      <div className="bg-neutral-50 rounded-lg p-4 space-y-2 text-sm text-neutral-600">
        <h4 className="font-semibold text-neutral-700 mb-2">Demo includes:</h4>
        <ul className="space-y-1 text-sm">
          <li>• Family contacts: Michael (son), Jane (daughter), Iris (partner)</li>
          <li>• Project: Kitchen Renovation (Personal domain) with phone/link/notes</li>
          <li>• 3 completed tasks to show history</li>
          <li>• Clean inbox ready for live demo brain dump</li>
        </ul>
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <button
          onClick={() => setShowConfirm('reset')}
          disabled={isResetting || isLoading || isClearing}
          className="w-full px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isResetting ? 'Resetting demo...' : '🔄 Reset Demo (Clear + Reload)'}
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleLoad}
            disabled={isResetting || isLoading || isClearing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load Data'}
          </button>

          <button
            onClick={() => setShowConfirm('clear')}
            disabled={isResetting || isLoading || isClearing}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {isClearing ? 'Clearing...' : 'Clear All'}
          </button>
        </div>
      </div>

      {/* Demo Script Quick Reference */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 mb-3">📋 Quick Demo Script</h4>
        <div className="text-sm text-blue-700 space-y-2">
          <p><strong>1. Show domain switching:</strong> Universal → Work → Family → Personal</p>
          <p><strong>2. Brain dump 5 tasks:</strong> (they'll auto-tag via context)</p>
          <ul className="ml-4 space-y-1 text-xs">
            <li>• "Pick up Michael from soccer at 6"</li>
            <li>• "Pick up Jane from climbing at 6"</li>
            <li>• "Call contractor about tile delay"</li>
            <li>• "Order cabinet hardware"</li>
            <li>• "Send Acme proposal draft"</li>
          </ul>
          <p><strong>3. Triage tasks:</strong> Schedule, add context, assign Jane pickup to Iris</p>
          <p><strong>4. Switch to mobile:</strong> Show execution with context surfacing</p>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 text-center mb-2">
              {showConfirm === 'reset' ? 'Reset Demo Data?' : 'Clear All Data?'}
            </h3>
            <p className="text-sm text-neutral-500 text-center mb-6">
              {showConfirm === 'reset'
                ? 'This will delete all current data and reload the demo state.'
                : 'This will permanently delete all tasks, projects, contacts, and routines.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={showConfirm === 'reset' ? handleReset : handleClear}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
              >
                {showConfirm === 'reset' ? 'Reset' : 'Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
