import {
  CalendarClock,
  CheckSquare,
  Circle,
  FileText,
  Phone,
  RefreshCw,
  ShoppingBasket,
  Utensils,
} from 'lucide-react'
import type { TaskCategory } from '@/types/task'
import { inferTaskVisualKind, TASK_KIND_LABEL, type TaskVisualKind } from '@/lib/taskVisualKind'

interface TaskKindBadgeProps {
  title: string
  category?: TaskCategory | null
  note?: string | null
  id?: string | null
  kind?: TaskVisualKind
  label?: boolean
  className?: string
}

const META: Record<TaskVisualKind, { Icon: typeof Circle; className: string }> = {
  appointment: {
    Icon: CalendarClock,
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  activity: {
    Icon: CheckSquare,
    className: 'border-sage-200 bg-sage-50 text-sage-600',
  },
  meal: {
    Icon: Utensils,
    className: 'border-accent-200 bg-accent-50 text-accent-500',
  },
  shopping: {
    Icon: ShoppingBasket,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  call: {
    Icon: Phone,
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  form: {
    Icon: FileText,
    className: 'border-review-200 bg-review-50 text-review-600',
  },
  routine: {
    Icon: RefreshCw,
    className: 'border-primary-200 bg-primary-50 text-primary-700',
  },
  task: {
    Icon: Circle,
    className: 'border-neutral-200 bg-white text-neutral-500',
  },
}

export function TaskKindBadge({ title, category, note, id, kind, label = false, className = '' }: TaskKindBadgeProps) {
  const resolved = kind ?? inferTaskVisualKind({ title, category, note, id })
  const meta = META[resolved]
  const text = TASK_KIND_LABEL[resolved]

  return (
    <span
      title={text}
      aria-label={text}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${meta.className} ${className}`}
    >
      <meta.Icon className="h-3 w-3" aria-hidden="true" />
      {label && <span>{text}</span>}
    </span>
  )
}
