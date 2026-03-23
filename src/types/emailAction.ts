export type EmailActionCategory = 'school' | 'medical' | 'social' | 'financial' | 'household'
export type EmailActionUrgency = 'urgent' | 'normal' | 'low'
export type EmailActionStatus = 'new' | 'acknowledged' | 'snoozed' | 'done' | 'dismissed'

export interface EmailActionItem {
  id: string
  user_id: string
  email_message_id: string
  email_subject: string | null
  email_from: string | null
  email_date: string | null
  title: string
  description: string | null
  category: EmailActionCategory
  urgency: EmailActionUrgency
  status: EmailActionStatus
  due_date: string | null
  amount_cents: number | null
  relevant_member_id: string | null
  assigned_to: string | null
  acknowledged_at: string | null
  snoozed_until: string | null
  task_id: string | null
  created_at: string
  updated_at: string
}

export const CATEGORY_CONFIG: Record<EmailActionCategory, { icon: string; label: string; color: string }> = {
  school: { icon: '🎒', label: 'School', color: '#60A5FA' },
  medical: { icon: '🏥', label: 'Medical', color: '#F87171' },
  social: { icon: '🎉', label: 'Social', color: '#A78BFA' },
  financial: { icon: '💰', label: 'Financial', color: '#FBBF24' },
  household: { icon: '🏠', label: 'Household', color: '#34D399' },
}

export const URGENCY_CONFIG: Record<EmailActionUrgency, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#EF4444' },
  normal: { label: 'Normal', color: '#9CA3AF' },
  low: { label: 'Low', color: '#6B7280' },
}
