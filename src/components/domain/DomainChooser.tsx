import { DOMAINS, type DomainId } from '@/lib/domains'

export function DomainChooser({ onChoose, size = 'md' }: { onChoose: (d: DomainId) => void; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <div role="group" aria-label="Choose a domain" className="inline-flex gap-1.5">
      {DOMAINS.map(({ id, label, icon: Icon, color }) => (
        <button key={id} type="button" onClick={() => onChoose(id)}
          className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 ${pad}`}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
