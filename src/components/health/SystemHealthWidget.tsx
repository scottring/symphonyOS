import { useState } from 'react'
import type { Task } from '@/types/task'
import {
  useSystemHealth,
  getHealthTextClasses,
  getHealthMessage,
} from '@/hooks/useSystemHealth'

interface ClarityWidgetProps {
  tasks: Task[]
  /** Default expanded state */
  defaultExpanded?: boolean
  /** Optional user stats for streak display */
  inboxZeroStreak?: number
  /** Optional weekly review streak */
  weeklyReviewStreak?: number
}

/**
 * ClarityWidget - Shows mental clarity score at a glance
 *
 * "Clarity" represents how clear your mind can be when everything
 * has a temporal home. It's warm and personal, not technical.
 *
 * Philosophy: Motivating without being guilt-inducing. Uses warm
 * colors and celebrates progress rather than punishing neglect.
 */
export function SystemHealthWidget({
  tasks,
  defaultExpanded = false,
  inboxZeroStreak = 0,
  weeklyReviewStreak = 0,
}: ClarityWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const metrics = useSystemHealth(tasks)

  // Don't show widget if there are no tasks at all
  if (tasks.length === 0) {
    return null
  }

  const textClasses = getHealthTextClasses(metrics.healthColor)
  const message = getHealthMessage(metrics)

  return (
    <div
      className="bg-bg-elevated rounded-xl border border-neutral-200 shadow-sm mb-6 overflow-hidden transition-all"
      role="region"
      aria-label="Clarity"
    >
      {/* Collapsed state - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-neutral-50 transition-colors"
        aria-expanded={isExpanded}
      >
        {/* Donut chart */}
        <ClarityRing score={metrics.score} color={metrics.healthColor} size={48} />

        {/* Label and status */}
        <div className="flex-1 flex flex-col items-start">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-600">Clarity</span>
            {metrics.isInboxZero && metrics.score >= 85 && (
              <span className="text-base" role="img" aria-label="Star">
                ⭐
              </span>
            )}
          </div>
          <span className={`text-xs ${textClasses}`}>
            {metrics.healthStatus}
          </span>
        </div>

        {/* Expand/collapse icon */}
        <ChevronIcon
          className={`w-4 h-4 text-neutral-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded state - details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-neutral-100 pt-3 animate-fade-in-up">
          {/* Message */}
          <p className="text-sm text-neutral-600 mb-4">{message}</p>

          {/* Metrics breakdown */}
          <div className="space-y-2 mb-4">
            <MetricRow
              icon={<CheckCircleIcon className="w-4 h-4" />}
              label="Items with temporal homes"
              value={metrics.itemsWithHome}
              color="text-primary-600"
            />
            {metrics.deferredItems > 0 && (
              <MetricRow
                icon={<ClockIcon className="w-4 h-4" />}
                label="Items deferred to future"
                value={metrics.deferredItems}
                color="text-sage-600"
              />
            )}
            {metrics.freshInboxItems > 0 && (
              <MetricRow
                icon={<InboxIcon className="w-4 h-4" />}
                label="Fresh items in inbox"
                value={metrics.freshInboxItems}
                color="text-neutral-600"
                suffix="(< 4 days)"
              />
            )}
            {metrics.agingItems > 0 && (
              <MetricRow
                icon={<AlertIcon className="w-4 h-4" />}
                label="Aging items"
                value={metrics.agingItems}
                color="text-amber-600"
                suffix="(4-7 days)"
              />
            )}
            {metrics.staleItems > 0 && (
              <MetricRow
                icon={<AlertIcon className="w-4 h-4" />}
                label="Items needing attention"
                value={metrics.staleItems}
                color="text-orange-600"
                suffix="(8+ days)"
              />
            )}
            {metrics.unassignedItems > 0 && (
              <MetricRow
                icon={<UserIcon className="w-4 h-4" />}
                label="Items without owner"
                value={metrics.unassignedItems}
                color="text-amber-500"
                suffix="(50% credit)"
              />
            )}
            {metrics.emptyProjects > 0 && (
              <MetricRow
                icon={<FolderIcon className="w-4 h-4" />}
                label="Empty projects"
                value={metrics.emptyProjects}
                color="text-orange-500"
                suffix="(-5 pts each)"
              />
            )}
          </div>

          {/* Streaks */}
          {(inboxZeroStreak > 0 || weeklyReviewStreak > 0) && (
            <div className="flex items-center gap-4 pt-3 border-t border-neutral-100">
              {inboxZeroStreak > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <span role="img" aria-label="Fire">🔥</span>
                  <span className="text-neutral-600">
                    Inbox Zero: <strong className="text-neutral-800">{inboxZeroStreak} day{inboxZeroStreak !== 1 ? 's' : ''}</strong>
                  </span>
                </div>
              )}
              {weeklyReviewStreak > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <span role="img" aria-label="Calendar">📋</span>
                  <span className="text-neutral-600">
                    Weekly Review: <strong className="text-neutral-800">{weeklyReviewStreak} week{weeklyReviewStreak !== 1 ? 's' : ''}</strong>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ClarityRing - Donut chart showing clarity percentage
 */
interface ClarityRingProps {
  score: number
  color: 'excellent' | 'good' | 'fair' | 'needsAttention'
  size?: number
}

function ClarityRing({ score, color, size = 48 }: ClarityRingProps) {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const offset = circumference - progress

  // Color based on health status
  const ringColor = {
    excellent: 'stroke-primary-500',
    good: 'stroke-sage-500',
    fair: 'stroke-amber-500',
    needsAttention: 'stroke-orange-500',
  }[color]

  const textColor = {
    excellent: 'text-primary-600',
    good: 'text-sage-600',
    fair: 'text-amber-600',
    needsAttention: 'text-orange-600',
  }[color]

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-100"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${ringColor} transition-all duration-500`}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-semibold ${textColor}`}>
          {score}
        </span>
      </div>
    </div>
  )
}

interface MetricRowProps {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  suffix?: string
}

function MetricRow({ icon, label, value, color, suffix }: MetricRowProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={color}>{icon}</span>
      <span className="text-neutral-700">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
      {suffix && <span className="text-neutral-400 text-xs">{suffix}</span>}
    </div>
  )
}

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

export default SystemHealthWidget
