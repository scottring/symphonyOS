// src/lib/workingHours.ts
//
// Single source of truth for the "working hours" window. Family hours are
// defined as its complement, so a future settings editor only has to expose
// one concept. v1 ships with this constant; no settings UI yet.

export interface WorkingHours {
  /** Days counted as working days. 0 = Sunday … 6 = Saturday. */
  days: number[]
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

export const WORKING_HOURS: WorkingHours = {
  days: [1, 2, 3, 4, 5], // Mon–Fri
  startHour: 9,
  startMinute: 0,
  endHour: 17,
  endMinute: 30, // 5:30pm
}

/** True when `date` (local wall-clock) falls inside the working window. */
export function isWorkingHours(date: Date, config: WorkingHours = WORKING_HOURS): boolean {
  if (!config.days.includes(date.getDay())) return false
  const minutes = date.getHours() * 60 + date.getMinutes()
  const start = config.startHour * 60 + config.startMinute
  const end = config.endHour * 60 + config.endMinute
  return minutes >= start && minutes < end
}

/** Family hours = everything outside the working window. */
export function isFamilyHours(date: Date, config: WorkingHours = WORKING_HOURS): boolean {
  return !isWorkingHours(date, config)
}
