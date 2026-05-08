interface PanelFooterProps {
  createdAt: Date
  updatedAt: Date
  createdByName?: string
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isLater(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) > 60_000 && a.getTime() > b.getTime()
}

export function PanelFooter({ createdAt, updatedAt, createdByName }: PanelFooterProps) {
  const parts: string[] = [`Created ${fmt(createdAt)}`]
  if (createdByName) parts[0] += ` by ${createdByName}`
  if (isLater(updatedAt, createdAt)) parts.push(`Updated ${fmt(updatedAt)}`)

  return (
    <footer className="text-[11px] text-neutral-400 pt-3 mt-3 border-t border-neutral-200">
      {parts.join(' · ')}
    </footer>
  )
}
