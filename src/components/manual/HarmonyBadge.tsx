// HarmonyBadge — Visual harmony status indicator for domain cards
// Shows Resonating / Adjusting / Needs Attention / Not Yet Assessed

import { getHarmonyStatus, HARMONY_LABELS, HARMONY_COLORS } from '@/types/manual'
import type { HarmonyStatus } from '@/types/manual'

interface HarmonyBadgeProps {
  score: number
  className?: string
}

const STATUS_ICONS: Record<HarmonyStatus, string> = {
  resonating: 'M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z',
  adjusting: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z',
  discordant: 'M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z',
  uncharted: 'M5.127 3.502L5.25 3.5h9.5c.041 0 .082 0 .123.002A2.251 2.251 0 0012.75 2h-5.5a2.25 2.25 0 00-2.123 1.502zM1 10.25A2.25 2.25 0 013.25 8h13.5A2.25 2.25 0 0119 10.25v5.5A2.25 2.25 0 0116.75 18H3.25A2.25 2.25 0 011 15.75v-5.5zM3.25 6.5c-.04 0-.082 0-.123.002A2.25 2.25 0 015.25 5h9.5c.98 0 1.814.627 2.123 1.502a3.819 3.819 0 00-.123-.002H3.25z',
}

export function HarmonyBadge({ score, className = '' }: HarmonyBadgeProps) {
  const status = getHarmonyStatus(score)
  const label = HARMONY_LABELS[status]
  const colors = HARMONY_COLORS[status]
  const iconPath = STATUS_ICONS[status]

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${colors} ${className}`}>
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d={iconPath} clipRule="evenodd" />
      </svg>
      {label}
      {status !== 'uncharted' && Number.isFinite(score) && (
        <span className="opacity-60">{score}</span>
      )}
    </span>
  )
}
