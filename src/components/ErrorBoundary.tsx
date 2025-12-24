import * as Sentry from '@sentry/react'

interface Props {
  children: React.ReactNode
}

export function ErrorBoundary({ children }: Props) {
  return (
    <Sentry.ErrorBoundary
      fallback={(errorData) => {
        const error = errorData.error as Error
        return (
          <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral-800 mb-2">
                Something went wrong
              </h2>
              <p className="text-neutral-600 mb-6">
                We've been notified and are working on a fix. Try refreshing the page.
              </p>
              {import.meta.env.DEV && error && (
                <div className="mb-6 p-4 bg-neutral-50 rounded-lg text-left">
                  <p className="text-xs font-mono text-red-600 break-all">
                    {error.message}
                  </p>
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
                >
                  Refresh Page
                </button>
                {import.meta.env.DEV && (
                  <button
                    onClick={errorData.resetError}
                    className="px-6 py-3 border border-neutral-200 text-neutral-600 rounded-lg font-medium hover:bg-neutral-50 transition-colors"
                  >
                    Try Again
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      }}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
