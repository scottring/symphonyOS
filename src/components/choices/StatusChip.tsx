import { STATUS_LABEL, type OptionStatus } from '@/types/choice'

const TONE: Record<OptionStatus, string> = {
  considering: 'bg-neutral-100 text-neutral-600',
  contacted: 'bg-amber-50 text-amber-700',
  heard_back: 'bg-primary-50 text-primary-700',
  ruled_out: 'bg-neutral-100 text-neutral-400',
  chosen: 'bg-primary-100 text-primary-800',
}

export function StatusChip({ status }: { status: OptionStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
