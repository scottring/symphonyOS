// The one card treatment every widget on a person's page shares. A page of
// widgets reads as a system only when the frames are identical; the kiosk
// failure mode is "randomly stacked cards". Title row: icon + label in the
// wall's small caps. Body fills the rest and never scrolls unless the widget
// says so (the checklist column is the one exception).
import type { LucideIcon } from 'lucide-react'
import { WALL } from '../wallTheme'

export function Widget({ title, icon: Icon, className = '', children }: {
  title: string
  icon: LucideIcon
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`${WALL.card} p-4 flex flex-col min-h-0 min-w-0 overflow-hidden ${className}`}>
      <div className={`${WALL.label} shrink-0 mb-2 flex items-center gap-1.5`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
        {title}
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-2">{children}</div>
    </section>
  )
}
