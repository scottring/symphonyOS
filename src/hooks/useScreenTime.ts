import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'

// --- Types ---

export interface ScreenTimeBudget {
  id: string
  familyMemberId: string
  dailyMinutes: number
  dayType: 'all' | 'school-day' | 'weekend'
}

export interface ScreenTimeEntry {
  id: string
  familyMemberId: string
  date: string
  minutesUsed: number
}

export interface ScreenTimeAdjustment {
  id: string
  familyMemberId: string
  date: string
  minutes: number // negative = penalty, positive = bonus
  reason: string
}

export interface ChildScreenTimeSummary {
  familyMemberId: string
  childName: string
  color: FamilyMemberColor
  budgetMinutes: number
  usedMinutes: number
  adjustmentMinutes: number
  effectiveBudget: number
  remainingMinutes: number
  percentUsed: number
  status: 'green' | 'amber' | 'red'
  adjustments: ScreenTimeAdjustment[]
}

// --- Pure computation (used by both this hook and useWallData) ---

/**
 * A child is anyone who is not a parent and has no account of their own.
 * Scott's roster labels the kids 'family', not 'child' (the label is free
 * text from the member form), so matching the literal word found nobody and
 * every screen-time summary came back empty.
 */
export function isChildMember(m: Pick<FamilyMember, 'role_label' | 'is_full_user'>): boolean {
  if (m.role_label === 'child') return true
  return m.role_label !== 'parent' && !m.is_full_user
}

export function computeScreenTimeSummaries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawBudgets: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawEntries: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawAdjustments: any[],
  familyMembers: FamilyMember[],
  dateStr: string,
): ChildScreenTimeSummary[] {
  const children = familyMembers.filter(isChildMember)

  return children.map(child => {
    // Find budget (prefer specific day_type match, fall back to 'all')
    const budget = rawBudgets.find(
      (b: { family_member_id: string }) => b.family_member_id === child.id
    )
    // No budget row means no standing allowance: on the wall, screen time is
    // what reading earned today (see readingScreenTime.ts). A household that
    // wants a base allowance sets one.
    const budgetMinutes = budget?.daily_minutes ?? 0

    // Find entry for this date
    const entry = rawEntries.find(
      (e: { family_member_id: string; date: string }) =>
        e.family_member_id === child.id && e.date === dateStr
    )
    const usedMinutes = entry?.minutes_used ?? 0

    // Sum adjustments for this date
    const dayAdjustments: ScreenTimeAdjustment[] = rawAdjustments
      .filter(
        (a: { family_member_id: string; date: string }) =>
          a.family_member_id === child.id && a.date === dateStr
      )
      .map((a: { id: string; family_member_id: string; date: string; minutes: number; reason: string }) => ({
        id: a.id,
        familyMemberId: a.family_member_id,
        date: a.date,
        minutes: a.minutes,
        reason: a.reason,
      }))

    const adjustmentMinutes = dayAdjustments.reduce((sum, a) => sum + a.minutes, 0)
    const effectiveBudget = Math.max(0, budgetMinutes + adjustmentMinutes)
    const remainingMinutes = effectiveBudget - usedMinutes
    const percentUsed = effectiveBudget > 0 ? Math.round((usedMinutes / effectiveBudget) * 100) : 0

    let status: 'green' | 'amber' | 'red' = 'green'
    if (percentUsed >= 100) status = 'red'
    else if (percentUsed >= 75) status = 'amber'

    return {
      familyMemberId: child.id,
      childName: child.name,
      color: child.color as FamilyMemberColor,
      budgetMinutes,
      usedMinutes,
      adjustmentMinutes,
      effectiveBudget,
      remainingMinutes,
      percentUsed,
      status,
      adjustments: dayAdjustments,
    }
  })
}

// --- Hook (for main app CRUD) ---

function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function useScreenTime() {
  const { user } = useAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [budgets, setBudgets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const todayStr = toDateString(new Date())

    const [budgetsRes, entriesRes, adjustmentsRes] = await Promise.all([
      supabase.from('screen_time_budgets').select('*'),
      supabase.from('screen_time_entries').select('*').eq('date', todayStr),
      supabase.from('screen_time_adjustments').select('*').eq('date', todayStr),
    ])

    setBudgets(budgetsRes.data || [])
    setEntries(entriesRes.data || [])
    setAdjustments(adjustmentsRes.data || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const setBudget = useCallback(async (familyMemberId: string, dailyMinutes: number, dayType = 'all') => {
    if (!user) return
    await supabase.from('screen_time_budgets').upsert({
      user_id: user.id,
      family_member_id: familyMemberId,
      daily_minutes: dailyMinutes,
      day_type: dayType,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'family_member_id,day_type' })
    fetchAll()
  }, [user, fetchAll])

  const logMinutes = useCallback(async (familyMemberId: string, minutesUsed: number, date?: string) => {
    if (!user) return
    const dateStr = date || toDateString(new Date())
    await supabase.from('screen_time_entries').upsert({
      user_id: user.id,
      family_member_id: familyMemberId,
      date: dateStr,
      minutes_used: minutesUsed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'family_member_id,date' })
    fetchAll()
  }, [user, fetchAll])

  const addAdjustment = useCallback(async (familyMemberId: string, minutes: number, reason: string, date?: string) => {
    if (!user) return
    const dateStr = date || toDateString(new Date())
    await supabase.from('screen_time_adjustments').insert({
      user_id: user.id,
      family_member_id: familyMemberId,
      date: dateStr,
      minutes,
      reason,
    })
    fetchAll()
  }, [user, fetchAll])

  const removeAdjustment = useCallback(async (adjustmentId: string) => {
    await supabase.from('screen_time_adjustments').delete().eq('id', adjustmentId)
    fetchAll()
  }, [fetchAll])

  return {
    budgets,
    entries,
    adjustments,
    loading,
    setBudget,
    logMinutes,
    addAdjustment,
    removeAdjustment,
    refetch: fetchAll,
  }
}
