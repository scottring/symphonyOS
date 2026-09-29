// A read that failed is not an empty list.
//
// Every list page used to fall through to its empty copy ("Nothing chosen
// yet.", "Inbox zero", "Nothing on October's plan yet") when the task fetch
// failed, so a dropped connection read as "you have nothing" — and invited
// people to re-add or re-plan work that was still there. This is the third
// state: it names the page, says the data is safe, and offers the page's own
// reload (never a new fetch path).

interface LoadFailedNoticeProps {
  /** What didn't load, as a sentence: "Today didn't load." */
  title: string
  /** Reassurance after the title. */
  body?: string
  /** The page's existing reload — the hook's refetch. */
  onRetry: () => void
  /**
   * `block` (default): a display-type line over a quiet body, where a page's
   * empty state would sit. `inline`: one quiet line, for hint-sized slots
   * (a plan column, a short list).
   */
  variant?: 'block' | 'inline'
  className?: string
  /** Class for the Try again button; defaults to the app's quiet text link. */
  buttonClassName?: string
}

const LINK = 'font-medium text-primary-600 underline-offset-2 hover:underline'

export function LoadFailedNotice({
  title,
  body = 'It’s safe — this is a connection problem.',
  onRetry,
  variant = 'block',
  className,
  buttonClassName = LINK,
}: LoadFailedNoticeProps) {
  const retry = (
    <button type="button" onClick={onRetry} className={buttonClassName}>
      Try again
    </button>
  )
  if (variant === 'inline') {
    return (
      <p role="alert" className={className ?? 'text-[14px] text-neutral-500'}>
        {title} {body}{' '}{retry}
      </p>
    )
  }
  return (
    <div role="alert" className={className ?? 'py-4'}>
      <p className="font-display text-lg text-neutral-700">{title}</p>
      <p className="mt-1 text-[14px] text-neutral-500">
        {body}{' '}{retry}
      </p>
    </div>
  )
}
