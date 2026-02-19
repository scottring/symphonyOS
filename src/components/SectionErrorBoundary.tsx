import * as Sentry from '@sentry/react'

interface Props {
  children: React.ReactNode
  sectionName?: string
  onReset?: () => void
}

export function SectionErrorBoundary({ children, sectionName = 'This section', onReset }: Props) {
  return (
    <Sentry.ErrorBoundary
      fallback={(errorData) => (
        <div className="h-full flex items-center justify-center p-8">
          <div className="max-w-sm w-full text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 mb-1">
              {sectionName} hit an error
            </h3>
            <p className="text-sm text-neutral-500 mb-5">
              The rest of Symphony is still working fine.
            </p>
            <button
              onClick={() => {
                errorData.resetError()
                onReset?.()
              }}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      )}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
