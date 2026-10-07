import { describe, it, expect } from 'vitest'
import { Phone, Landmark, Snowflake, Sparkles, CalendarDays, Calculator, BookOpen, Folder, MapPin, Briefcase, House, Car, Utensils, Stethoscope } from 'lucide-react'
import { taskIconFor } from './taskIcon'

// Scott, 2026-10-07: icons that smartly match the task.
describe('taskIconFor', () => {
  it('reads the title first — the most specific signal', () => {
    expect(taskIconFor({ title: 'Call Sleep Study' })).toBe(Phone)
    expect(taskIconFor({ title: 'Visit Fulton Bank branch to negotiate unclaimed cashier’s check' })).toBe(Landmark)
    expect(taskIconFor({ title: 'plan for winter break research' })).toBe(Snowflake)
    expect(taskIconFor({ title: 'Tidy bedrooms' })).toBe(Sparkles)
    expect(taskIconFor({ title: 'Ella & Kaleb math time' })).toBe(Calculator)
    expect(taskIconFor({ title: 'Kaleb & Ella reading time' })).toBe(BookOpen)
    expect(taskIconFor({ title: 'Empty takehome folder + do homework' })).toBe(BookOpen)
    expect(taskIconFor({ title: 'Scott early school pickup' })).toBe(Car)
    expect(taskIconFor({ title: 'Plan Thanksgiving' })).toBe(Utensils)
    expect(taskIconFor({ title: 'Walgreens appointment' })).toBe(Stethoscope)
    expect(taskIconFor({ title: 'Sign and return the field trip form' })).toBe(Folder)
  })

  it('then what is attached', () => {
    expect(taskIconFor({ title: 'Ms. Reynolds', phoneNumber: '410-555-0100' })).toBe(Phone)
    expect(taskIconFor({ title: 'Quarterly thing', location: '1400 Coppermine Terr' })).toBe(MapPin)
  })

  it('then what kind of thing it is, then its life area — every task gets one', () => {
    expect(taskIconFor({ title: 'Grampappa', type: 'event' })).toBe(CalendarDays)
    expect(taskIconFor({ title: 'Quarterly thing', context: 'work' })).toBe(Briefcase)
    expect(taskIconFor({ title: 'Quarterly thing', context: 'family' })).toBe(House)
    expect(taskIconFor({ title: 'Quarterly thing' })).toBe(Folder)
  })

  it('does not match a word inside another word', () => {
    expect(taskIconFor({ title: 'Careful with the cartons', context: 'work' })).toBe(Briefcase)
  })
})
