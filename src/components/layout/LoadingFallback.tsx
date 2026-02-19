interface LoadingFallbackProps {
  variant?: 'page' | 'card' | 'list' | 'inline'
}

export function LoadingFallback({ variant = 'page' }: LoadingFallbackProps) {
  if (variant === 'inline') {
    return <div className="skeleton h-4 w-32 rounded" />
  }

  if (variant === 'card') {
    return (
      <div className="p-4 space-y-3">
        <div className="skeleton h-5 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-5 w-5 rounded-full shrink-0" />
            <div className="skeleton h-4 rounded flex-1" />
          </div>
        ))}
      </div>
    )
  }

  // Default: page skeleton
  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="skeleton h-7 w-48 rounded" />
        <div className="skeleton h-4 w-72 rounded" />
      </div>
      {/* Content skeleton */}
      <div className="space-y-4 flex-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-5 w-5 rounded-full shrink-0" />
            <div className="skeleton h-4 rounded" style={{ width: `${70 - i * 10}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
