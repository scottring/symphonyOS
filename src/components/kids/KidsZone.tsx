import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Task } from '@/types/task'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'
import './kids-tracker.css'
import './kids-timeline.css'

// =============================================================================
// TYPES
// =============================================================================

interface KidsZoneProps {
  // Data from Symphony
  tasks: Task[]
  routines: Routine[]
  events: CalendarEvent[]
  dateInstances: ActionableInstance[]
  familyMembers: FamilyMember[]

  // Current date
  viewedDate: Date

  // Callbacks
  onToggleTask: (taskId: string) => void
  onCompleteRoutine: (routineId: string, completed: boolean) => void
  onBack?: () => void
}

interface KidsTimelineItem {
  id: string
  type: 'task' | 'event' | 'routine'
  title: string
  icon: string
  startTime: Date | null
  endTime?: Date | null
  completed: boolean
  category?: string
  points?: number
  originalId: string
}

// =============================================================================
// ICON MAPPING - Map task/routine names to fun emojis
// =============================================================================

const ICON_KEYWORDS: Record<string, string> = {
  // Morning routines
  'wake': '🌅',
  'brush teeth': '🪥',
  'teeth': '🦷',
  'shower': '🚿',
  'bath': '🛁',
  'bed': '🛏️',
  'breakfast': '🥣',
  'dress': '👕',
  'clothes': '👔',

  // Chores
  'clean': '🧹',
  'tidy': '🧹',
  'vacuum': '🧹',
  'dishes': '🍽️',
  'laundry': '🧺',
  'trash': '🗑️',
  'garbage': '🗑️',
  'room': '🚪',
  'toy': '🧸',
  'toys': '🧸',

  // Pets
  'dog': '🐕',
  'cat': '🐱',
  'fish': '🐠',
  'pet': '🐾',
  'feed': '🍖',
  'walk': '🚶',

  // School/Learning
  'homework': '📚',
  'school': '🏫',
  'read': '📖',
  'study': '📝',
  'practice': '🎯',
  'lesson': '📓',

  // Activities
  'soccer': '⚽',
  'football': '🏈',
  'basketball': '🏀',
  'swim': '🏊',
  'dance': '💃',
  'music': '🎵',
  'piano': '🎹',
  'guitar': '🎸',
  'art': '🎨',
  'sport': '🏆',
  'game': '🎮',
  'play': '🎯',

  // Meals
  'lunch': '🥪',
  'dinner': '🍝',
  'snack': '🍎',
  'eat': '🍴',
  'meal': '🍽️',
  'cook': '👨‍🍳',

  // Evening
  'sleep': '😴',
  'night': '🌙',
  'pajama': '🌙',
  'story': '📖',
  'bedtime': '🛏️',

  // Outdoor
  'outside': '🌳',
  'garden': '🌱',
  'plant': '🌱',
  'water': '💧',
  'bike': '🚴',
  'park': '🏞️',

  // Default categories
  'chore': '✅',
  'task': '📋',
  'event': '📅',
  'routine': '🔄',
}

function getIconForTitle(title: string): string {
  const lowerTitle = title.toLowerCase()

  for (const [keyword, icon] of Object.entries(ICON_KEYWORDS)) {
    if (lowerTitle.includes(keyword)) {
      return icon
    }
  }

  return '⭐' // Default star
}

// Points based on task category/type
function getPointsForItem(item: { type: string; category?: string; title: string }): number {
  const lowerTitle = item.title.toLowerCase()

  // Homework/reading gets more points
  if (lowerTitle.includes('homework') || lowerTitle.includes('read') || lowerTitle.includes('study')) {
    return 20
  }

  // Chores get medium points
  if (lowerTitle.includes('clean') || lowerTitle.includes('tidy') || lowerTitle.includes('bed')) {
    return 10
  }

  // Quick tasks get fewer points
  if (lowerTitle.includes('brush') || lowerTitle.includes('teeth')) {
    return 5
  }

  // Default based on type
  if (item.type === 'routine') return 10
  if (item.type === 'task') return 10
  return 5
}

// Category based on title keywords
function getCategoryForTitle(title: string): string {
  const lowerTitle = title.toLowerCase()

  if (lowerTitle.includes('homework') || lowerTitle.includes('read') || lowerTitle.includes('study') || lowerTitle.includes('school')) {
    return 'homework'
  }
  if (lowerTitle.includes('clean') || lowerTitle.includes('tidy') || lowerTitle.includes('bed') || lowerTitle.includes('brush') || lowerTitle.includes('bath') || lowerTitle.includes('shower')) {
    return 'chore'
  }
  if (lowerTitle.includes('breakfast') || lowerTitle.includes('lunch') || lowerTitle.includes('dinner') || lowerTitle.includes('snack') || lowerTitle.includes('eat')) {
    return 'meal'
  }
  if (lowerTitle.includes('sleep') || lowerTitle.includes('night') || lowerTitle.includes('bedtime') || lowerTitle.includes('pajama')) {
    return 'bedtime'
  }
  if (lowerTitle.includes('soccer') || lowerTitle.includes('sport') || lowerTitle.includes('practice') || lowerTitle.includes('game') || lowerTitle.includes('play') || lowerTitle.includes('dance') || lowerTitle.includes('swim')) {
    return 'activity'
  }

  return 'chore'
}

// =============================================================================
// TIME SECTIONS
// =============================================================================

type TimeSection = 'morning' | 'afternoon' | 'evening'

const TIME_SECTIONS = [
  { id: 'morning' as const, label: 'Morning', emoji: '☀️', startHour: 5, endHour: 12, color: '#FFD93D' },
  { id: 'afternoon' as const, label: 'Afternoon', emoji: '🌞', startHour: 12, endHour: 17, color: '#FF9F43' },
  { id: 'evening' as const, label: 'Evening', emoji: '🌟', startHour: 17, endHour: 24, color: '#6C5CE7' },
]

const CATEGORY_STYLES: Record<string, { bg: string; border: string; glow: string }> = {
  chore: { bg: 'linear-gradient(135deg, #E8FFF4 0%, #D4FFED 100%)', border: '#1DD1A1', glow: 'rgba(29, 209, 161, 0.3)' },
  homework: { bg: 'linear-gradient(135deg, #E8F4FF 0%, #D4ECFF 100%)', border: '#54A0FF', glow: 'rgba(84, 160, 255, 0.3)' },
  activity: { bg: 'linear-gradient(135deg, #FFF4E8 0%, #FFE8D4 100%)', border: '#FF9F43', glow: 'rgba(255, 159, 67, 0.3)' },
  meal: { bg: 'linear-gradient(135deg, #FFE8EE 0%, #FFD4E0 100%)', border: '#FF6B9D', glow: 'rgba(255, 107, 157, 0.3)' },
  bedtime: { bg: 'linear-gradient(135deg, #F3E8FF 0%, #E8D4FF 100%)', border: '#A55EEA', glow: 'rgba(165, 94, 234, 0.3)' },
  fun: { bg: 'linear-gradient(135deg, #FFECD2 0%, #FCB69F 100%)', border: '#FF6B6B', glow: 'rgba(255, 107, 107, 0.3)' },
}

// =============================================================================
// HELPERS
// =============================================================================

function formatTimeForKids(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  if (minutes === 0) {
    return `${displayHours} ${ampm}`
  }
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getCurrentSection(): TimeSection {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function KidsZone({
  tasks,
  routines,
  events,
  dateInstances,
  familyMembers,
  viewedDate,
  onToggleTask,
  onCompleteRoutine,
  onBack,
}: KidsZoneProps) {
  const [showConfetti, setShowConfetti] = useState(false)
  const [celebrationEmoji, setCelebrationEmoji] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  // Pre-generate confetti styles (stable across renders)
  const confettiStyles = useMemo(() =>
    [...Array(15)].map((_, i) => ({
      left: `${(i * 7 + (i * 13) % 100)}%`,
      animationDelay: `${(i * 0.02)}s`,
    })), []
  )

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Build routine status map
  const routineStatusMap = useMemo(() => {
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        map.set(instance.entity_id, instance)
      }
    }
    return map
  }, [dateInstances])

  // Convert Symphony data to kids timeline items
  const timelineItems = useMemo((): KidsTimelineItem[] => {
    const items: KidsTimelineItem[] = []
    const viewedDateStr = viewedDate.toDateString()

    // Add tasks scheduled for today
    tasks.forEach(task => {
      if (task.scheduledFor && new Date(task.scheduledFor).toDateString() === viewedDateStr) {
        items.push({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          icon: getIconForTitle(task.title),
          startTime: new Date(task.scheduledFor),
          completed: task.completed,
          category: getCategoryForTitle(task.title),
          points: getPointsForItem({ type: 'task', title: task.title }),
          originalId: task.id,
        })
      }
    })

    // Add routines for today
    routines.forEach(routine => {
      // Check if routine should appear today based on recurrence
      const instance = routineStatusMap.get(routine.id)
      const isCompleted = instance?.status === 'completed'
      const isSkipped = instance?.status === 'skipped'

      if (isSkipped) return // Don't show skipped routines

      // Parse time_of_day to create start time
      let startTime: Date | null = null
      if (routine.time_of_day) {
        const [hours, minutes] = routine.time_of_day.split(':').map(Number)
        startTime = new Date(viewedDate)
        startTime.setHours(hours, minutes, 0, 0)
      }

      items.push({
        id: `routine-${routine.id}`,
        type: 'routine',
        title: routine.name,
        icon: getIconForTitle(routine.name),
        startTime,
        completed: isCompleted,
        category: getCategoryForTitle(routine.name),
        points: getPointsForItem({ type: 'routine', title: routine.name }),
        originalId: routine.id,
      })
    })

    // Add calendar events for today
    events.forEach(event => {
      // Handle both snake_case and camelCase formats
      const startTimeStr = event.start_time || event.startTime
      const endTimeStr = event.end_time || event.endTime

      if (!startTimeStr) return // Skip events without start time

      const eventStart = new Date(startTimeStr)
      if (eventStart.toDateString() === viewedDateStr) {
        items.push({
          id: `event-${event.google_event_id || event.id}`,
          type: 'event',
          title: event.title,
          icon: getIconForTitle(event.title),
          startTime: eventStart,
          endTime: endTimeStr ? new Date(endTimeStr) : undefined,
          completed: false,
          category: getCategoryForTitle(event.title),
          points: 0, // Events don't give points
          originalId: event.google_event_id || event.id,
        })
      }
    })

    // Sort by start time
    items.sort((a, b) => {
      if (!a.startTime) return 1
      if (!b.startTime) return -1
      return a.startTime.getTime() - b.startTime.getTime()
    })

    return items
  }, [tasks, routines, events, viewedDate, routineStatusMap])

  // Group by time section
  const groupedItems = useMemo(() => {
    const groups: Record<TimeSection, KidsTimelineItem[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    }

    timelineItems.forEach(item => {
      if (!item.startTime) {
        groups.morning.push(item) // Default to morning
        return
      }
      const hour = item.startTime.getHours()

      if (hour >= 5 && hour < 12) {
        groups.morning.push(item)
      } else if (hour >= 12 && hour < 17) {
        groups.afternoon.push(item)
      } else {
        groups.evening.push(item)
      }
    })

    return groups
  }, [timelineItems])

  // Calculate progress
  const completedCount = timelineItems.filter(i => i.completed).length
  const totalCount = timelineItems.filter(i => i.type !== 'event').length // Events don't count for completion
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const totalPoints = timelineItems.filter(i => i.completed).reduce((sum, i) => sum + (i.points || 0), 0)

  // Trigger celebration
  const triggerCelebration = useCallback((emoji: string) => {
    setCelebrationEmoji(emoji)
    setShowConfetti(true)
    setTimeout(() => {
      setShowConfetti(false)
      setCelebrationEmoji('')
    }, 1500)
  }, [])

  // Handle toggle
  const handleToggle = useCallback((item: KidsTimelineItem) => {
    if (item.type === 'task') {
      onToggleTask(item.originalId)
      if (!item.completed) {
        triggerCelebration(item.icon)
      }
    } else if (item.type === 'routine') {
      onCompleteRoutine(item.originalId, !item.completed)
      if (!item.completed) {
        triggerCelebration(item.icon)
      }
    }
  }, [onToggleTask, onCompleteRoutine, triggerCelebration])

  // Check for all done
  useEffect(() => {
    if (completedCount === totalCount && totalCount > 0) {
      setTimeout(() => triggerCelebration('🎉'), 500)
    }
  }, [completedCount, totalCount, triggerCelebration])

  const isToday = viewedDate.toDateString() === new Date().toDateString()

  // Get first family member name or default
  const childName = familyMembers.length > 0 ? familyMembers[0].name : 'Superstar'

  return (
    <div className="kids-timeline">
      {/* Animated background */}
      <div className="kids-timeline-bg">
        <div className="floating-cloud cloud-1">☁️</div>
        <div className="floating-cloud cloud-2">☁️</div>
        <div className="floating-cloud cloud-3">⭐</div>
      </div>

      {/* Confetti */}
      {showConfetti && (
        <div className="confetti-overlay">
          {confettiStyles.map((style, i) => (
            <div
              key={i}
              className="confetti-star"
              style={style}
            >
              ⭐
            </div>
          ))}
          {celebrationEmoji && (
            <div className="celebration-emoji-big">{celebrationEmoji}</div>
          )}
        </div>
      )}

      {/* Header */}
      <header className="timeline-header">
        {onBack && (
          <button onClick={onBack} className="timeline-back-btn">
            ← Back
          </button>
        )}

        <div className="timeline-greeting">
          <div className="timeline-avatar">🌟</div>
          <div>
            <h1 className="timeline-title">{getGreeting()}, {childName}!</h1>
            <p className="timeline-date">
              {isToday ? "Here's your day" : viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} 📅
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="timeline-progress-row">
          <div className="timeline-stat">
            <span className="stat-emoji">✅</span>
            <span className="stat-number">{completedCount}/{totalCount}</span>
            <span className="stat-text">Done</span>
          </div>
          <div className="timeline-stat">
            <span className="stat-emoji">⭐</span>
            <span className="stat-number">{totalPoints}</span>
            <span className="stat-text">Stars</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="timeline-progress-bar">
          <div className="timeline-progress-fill" style={{ width: `${progressPercent}%` }}>
            {progressPercent > 5 && <span className="progress-emoji">🚀</span>}
          </div>
        </div>
        {progressPercent === 100 && totalCount > 0 && (
          <div className="all-done-message">
            🏆 Amazing job! You finished everything! 🌟
          </div>
        )}
      </header>

      {/* Timeline */}
      <main className="timeline-content">
        {TIME_SECTIONS.map(section => {
          const sectionItems = groupedItems[section.id]
          if (sectionItems.length === 0) return null

          const isCurrentSection = getCurrentSection() === section.id && isToday

          return (
            <div key={section.id} className={`time-section ${isCurrentSection ? 'current-section' : ''}`}>
              <div className="section-header">
                <div className="section-icon-bubble" style={{ backgroundColor: section.color }}>
                  <span>{section.emoji}</span>
                </div>
                <h2 className="section-title">{section.label}</h2>
                <div className="section-line" style={{ backgroundColor: section.color }} />
                {isCurrentSection && <span className="now-badge">NOW</span>}
              </div>

              <div className="section-items">
                {sectionItems.map((item, index) => {
                  const categoryStyle = CATEGORY_STYLES[item.category || 'chore']
                  const isNow = isToday && item.startTime && !item.completed &&
                    currentTime >= item.startTime &&
                    (!item.endTime || currentTime <= item.endTime)
                  const isActionable = item.type === 'task' || item.type === 'routine'

                  return (
                    <div
                      key={item.id}
                      className={`timeline-card ${item.completed ? 'completed' : ''} ${isNow ? 'happening-now' : ''}`}
                      style={{
                        animationDelay: `${index * 0.05}s`,
                        background: categoryStyle.bg,
                        borderColor: categoryStyle.border,
                        '--glow-color': categoryStyle.glow,
                      } as React.CSSProperties}
                    >
                      {/* Time */}
                      <div className="card-time">
                        {item.startTime && formatTimeForKids(item.startTime)}
                        {item.endTime && ` - ${formatTimeForKids(item.endTime)}`}
                      </div>

                      {/* Content */}
                      <div className="card-main">
                        {isActionable ? (
                          <button
                            className={`card-checkbox ${item.completed ? 'checked' : ''} ${item.type === 'routine' ? 'routine-style' : ''}`}
                            onClick={() => handleToggle(item)}
                          >
                            {item.completed ? '✓' : ''}
                          </button>
                        ) : (
                          <div className="card-checkbox event-style">📅</div>
                        )}

                        <div className={`card-icon ${item.completed ? 'completed-icon' : ''}`}>
                          {item.icon}
                        </div>

                        <div className="card-title-area">
                          <h3 className={`card-title ${item.completed ? 'completed-title' : ''}`}>
                            {item.title}
                          </h3>
                          {item.type === 'event' && <span className="event-badge">Event</span>}
                          {item.type === 'routine' && <span className="routine-badge">Routine</span>}
                        </div>

                        {item.points !== undefined && item.points > 0 && (
                          <div className={`card-points ${item.completed ? 'earned' : ''}`}>
                            <span>⭐</span>
                            <span>{item.points}</span>
                          </div>
                        )}
                      </div>

                      {isNow && (
                        <div className="now-indicator">
                          <span className="now-pulse" />
                          <span className="now-text">Happening now!</span>
                        </div>
                      )}

                      {item.completed && (
                        <div className="completion-stars">
                          <span className="star star-1">✨</span>
                          <span className="star star-2">⭐</span>
                          <span className="star star-3">✨</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {timelineItems.length === 0 && (
          <div className="empty-state">
            <div className="empty-emoji">🎈</div>
            <h3>No activities today!</h3>
            <p>Enjoy your free day!</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <div className="timeline-footer">
        <div className="footer-grass">
          <span>🌱</span>
          <span>🌸</span>
          <span>🌱</span>
          <span>🌼</span>
          <span>🌱</span>
        </div>
      </div>
    </div>
  )
}

export default KidsZone
