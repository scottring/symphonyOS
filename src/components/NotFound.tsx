import { useNavigate } from 'react-router-dom'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        <p className="text-6xl font-display text-neutral-300 mb-2">404</p>
        <h1 className="text-xl font-semibold text-neutral-800 mb-2">
          Page not found
        </h1>
        <p className="text-sm text-neutral-500 mb-6">
          This page doesn't exist in Symphony.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  )
}
