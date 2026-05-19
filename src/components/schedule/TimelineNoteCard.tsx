interface Props {
  title: string
  timeLabel?: string
}

export function TimelineNoteCard({ title, timeLabel }: Props) {
  return (
    <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50/60 text-left">
      <span className="text-xs text-neutral-400 w-12 tabular-nums">
        {timeLabel ?? ''}
      </span>
      <span className="text-base">📝</span>
      <span className="font-medium text-neutral-800">{title}</span>
    </div>
  )
}
