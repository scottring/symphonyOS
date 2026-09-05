import type { TaskContext } from '@/types/task'
import { domainById } from '@/lib/domains'

/**
 * The filled-in state of the capture domain picker: the domain this capture
 * will be filed into, plus the × that puts it back to Unsorted.
 *
 * Shared so every capture surface shows the same thing — ⌘K renders it inside
 * the parsed-field preview, the Today inline add renders it in place of the
 * chooser row. Colours come from DOMAINS, so it reads as the answer to the
 * DomainChooser chips rather than a separate palette.
 */
export function AppliedDomainChip({
  context,
  onClear,
}: {
  context: TaskContext
  onClear: () => void
}) {
  const domain = domainById(context)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
      style={{
        color: domain.color,
        borderColor: `color-mix(in srgb, ${domain.color} 30%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${domain.color} 12%, transparent)`,
      }}
    >
      {domain.label}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        aria-label="Clear context"
        className="ml-1 opacity-60 hover:opacity-100"
      >
        ×
      </button>
    </span>
  )
}
