import type { TaskContext } from '@/types/task'

export const DOMAIN_COLORS: Record<TaskContext, { dot: string; bg: string }> = {
  work: {
    dot: 'rgb(37 99 235)',       // Blue-600
    bg: 'rgba(37, 99, 235, 0.08)',
  },
  family: {
    dot: 'rgb(217 119 6)',       // Amber-600
    bg: 'rgba(217, 119, 6, 0.08)',
  },
  personal: {
    dot: 'rgb(147 51 234)',      // Purple-600
    bg: 'rgba(147, 51, 234, 0.08)',
  },
}
