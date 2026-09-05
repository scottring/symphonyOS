import { DOMAINS, type DomainId } from '@/lib/domains'
import { domainHotkeyLabel } from '@/lib/domainHotkey'

/**
 * The three domain chips. One component so the Inbox's "Where does this
 * belong?" gate and every capture surface can't drift apart.
 *
 * `shortcuts` prints the ⌥1/⌥2/⌥3 hint — only the capture inputs bind those
 * keys, so the gate leaves it off. The hint is aria-hidden, which keeps each
 * button's accessible name the bare domain label.
 */
export function DomainChooser({
  onChoose,
  size = 'md',
  shortcuts = false,
}: {
  onChoose: (d: DomainId) => void
  size?: 'sm' | 'md'
  shortcuts?: boolean
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <div role="group" aria-label="Choose a domain" className="inline-flex gap-1.5">
      {DOMAINS.map(({ id, label, icon: Icon, color }, i) => (
        <button key={id} type="button" onClick={() => onChoose(id)}
          className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 ${pad}`}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          <span>{label}</span>
          {shortcuts && (
            <kbd aria-hidden className="hidden md:inline text-[10px] leading-none text-neutral-400 font-sans">
              {domainHotkeyLabel(i)}
            </kbd>
          )}
        </button>
      ))}
    </div>
  )
}
