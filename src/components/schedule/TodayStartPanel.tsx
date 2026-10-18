import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import type { FirstWeekStep } from '@/lib/firstWeek'
import {
  markFirstSuccessDone, markFirstSuccessOffered, readFirstSuccess, shouldShowFirstSuccess, whereFirstThingIs,
  type FirstSuccessRecord,
} from '@/lib/firstSuccess'
import { FirstWeekCard } from './FirstWeekCard'
import { FirstSuccessNote } from './FirstSuccessNote'

/**
 * The top of Today for a new household: "Where would you like to start?" on
 * an empty planner, then — once the first task lands — a one-line
 * acknowledgment with optional next steps instead of nothing at all
 * (walkthrough 2026-10-08). HomeViewContainer still decides whether the start
 * panel is open; this decides what follows it.
 */
export function TodayStartPanel({ uid, tasks, tasksReady, startOpen, startHidden, steps, onHide, onSamplePage, onClearSample }: {
  uid: string
  tasks: Task[]
  /** Tasks loaded without error — an empty list while loading is not "empty". */
  tasksReady: boolean
  /** HomeViewContainer's showFirstWeek. */
  startOpen: boolean
  /** "Explore on my own" was chosen (FIRST_WEEK_HIDE_KEY is set). */
  startHidden: boolean
  steps: FirstWeekStep[]
  onHide: () => void
  onSamplePage: () => void
  onClearSample?: () => void
}) {
  // The start panel is in front of an empty planner: that is the offer the
  // follow-up line belongs to. Accounts never offered it never see the line.
  // The record lives in localStorage (written here, read each render — one
  // small key), so a reload picks up where the household left off.
  const offering = startOpen && tasksReady && tasks.length === 0
  useEffect(() => {
    if (offering) markFirstSuccessOffered(uid)
  }, [offering, uid])

  const [retired, setRetired] = useState(false)
  const retire = useCallback(() => {
    markFirstSuccessDone(uid)
    setRetired(true)
  }, [uid])

  if (startOpen) {
    return <Column><FirstWeekCard steps={steps} onHide={onHide} onSamplePage={onSamplePage} onClearSample={onClearSample} /></Column>
  }

  const now = new Date()
  const record: FirstSuccessRecord = retired ? 'done' : readFirstSuccess(uid)
  if (!shouldShowFirstSuccess({ record, ready: tasksReady, taskCount: tasks.length, startOpen, startHidden, now })) return null

  return (
    <Column>
      <FirstSuccessNote
        where={whereFirstThingIs(tasks, now)}
        onAddAnother={() => window.dispatchEvent(new Event('symphony:add-today'))}
        onPlanStep={retire}
        onDismiss={retire}
      />
    </Column>
  )
}

/** The SAME column the Today masthead draws in (TodayView's max-w-[1152px] +
 *  md:px-10 lg:px-14), so the panel sits directly above the day card on the
 *  same left and right edges. Drawn only when there is something in it, so an
 *  established account's Today gains no padding. */
function Column({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-[1152px] mr-auto px-0 pt-2 md:px-10 md:pt-8 lg:px-14">{children}</div>
}
