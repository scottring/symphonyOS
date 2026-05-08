import type { TaskBucket } from '@/types/task'

interface PanelMetaRowProps {
  bucket: TaskBucket | string
  assigneeName?: string
  createdByName?: string
  domain?: 'work' | 'family' | 'personal'
}

const DOMAIN_STYLES: Record<NonNullable<PanelMetaRowProps['domain']>, string> = {
  family: 'bg-emerald-50 text-emerald-700',
  work: 'bg-blue-50 text-blue-700',
  personal: 'bg-amber-50 text-amber-800',
}

export function PanelMetaRow({ bucket, assigneeName, createdByName, domain }: PanelMetaRowProps) {
  const parts: string[] = [bucket]
  if (assigneeName) parts.push(`for ${assigneeName}`)
  if (createdByName) parts.push(`created by ${createdByName}`)

  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
      {domain && (
        <span
          data-testid="domain-chip"
          className={`px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider text-[10px] ${DOMAIN_STYLES[domain]}`}
        >
          {domain}
        </span>
      )}
      <span>{parts.join(' · ')}</span>
    </div>
  )
}
