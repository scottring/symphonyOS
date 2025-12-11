import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getTaskAgeInDays,
  getTaskAgeInHours,
  getTaskAgeCategory,
  getTaskAgeLabel,
  getTaskAgeColor,
  getTaskAgeInfo,
  isTaskAging,
  isTaskStale,
  getAgeIndicatorClasses,
  type TaskAgeCategory,
} from './taskAge'

describe('taskAge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Set current time to noon on June 15, 2024
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getTaskAgeInDays', () => {
    it('returns 0 for task created today', () => {
      const createdAt = new Date('2024-06-15T10:00:00Z')
      expect(getTaskAgeInDays(createdAt)).toBe(0)
    })

    it('returns 1 for task created yesterday', () => {
      const createdAt = new Date('2024-06-14T12:00:00Z')
      expect(getTaskAgeInDays(createdAt)).toBe(1)
    })

    it('returns correct days for older task', () => {
      const createdAt = new Date('2024-06-10T12:00:00Z')
      expect(getTaskAgeInDays(createdAt)).toBe(5)
    })

    it('accepts string date format', () => {
      const createdAt = '2024-06-10T12:00:00Z'
      expect(getTaskAgeInDays(createdAt)).toBe(5)
    })

    it('handles same timestamp', () => {
      const createdAt = new Date('2024-06-15T12:00:00Z')
      expect(getTaskAgeInDays(createdAt)).toBe(0)
    })
  })

  describe('getTaskAgeInHours', () => {
    it('returns 0 for task created now', () => {
      const createdAt = new Date('2024-06-15T12:00:00Z')
      expect(getTaskAgeInHours(createdAt)).toBe(0)
    })

    it('returns correct hours for recent task', () => {
      const createdAt = new Date('2024-06-15T09:00:00Z')
      expect(getTaskAgeInHours(createdAt)).toBe(3)
    })

    it('returns correct hours for task from yesterday', () => {
      const createdAt = new Date('2024-06-14T12:00:00Z')
      expect(getTaskAgeInHours(createdAt)).toBe(24)
    })

    it('accepts string date format', () => {
      const createdAt = '2024-06-15T06:00:00Z'
      expect(getTaskAgeInHours(createdAt)).toBe(6)
    })
  })

  describe('getTaskAgeCategory', () => {
    it('returns fresh for tasks less than 1 day old', () => {
      const createdAt = new Date('2024-06-15T10:00:00Z')
      expect(getTaskAgeCategory(createdAt)).toBe('fresh')
    })

    it('returns recent for tasks 1-3 days old', () => {
      expect(getTaskAgeCategory(new Date('2024-06-14T12:00:00Z'))).toBe('recent')
      expect(getTaskAgeCategory(new Date('2024-06-13T12:00:00Z'))).toBe('recent')
      expect(getTaskAgeCategory(new Date('2024-06-12T12:00:00Z'))).toBe('recent')
    })

    it('returns aging for tasks 4-7 days old', () => {
      expect(getTaskAgeCategory(new Date('2024-06-11T12:00:00Z'))).toBe('aging')
      expect(getTaskAgeCategory(new Date('2024-06-10T12:00:00Z'))).toBe('aging')
      expect(getTaskAgeCategory(new Date('2024-06-08T12:00:00Z'))).toBe('aging')
    })

    it('returns stale for tasks 8-14 days old', () => {
      expect(getTaskAgeCategory(new Date('2024-06-07T12:00:00Z'))).toBe('stale')
      expect(getTaskAgeCategory(new Date('2024-06-05T12:00:00Z'))).toBe('stale')
      expect(getTaskAgeCategory(new Date('2024-06-01T12:00:00Z'))).toBe('stale')
    })

    it('returns very-stale for tasks 15+ days old', () => {
      expect(getTaskAgeCategory(new Date('2024-05-31T12:00:00Z'))).toBe('very-stale')
      expect(getTaskAgeCategory(new Date('2024-05-01T12:00:00Z'))).toBe('very-stale')
    })
  })

  describe('getTaskAgeLabel', () => {
    it('returns null for fresh tasks', () => {
      const createdAt = new Date('2024-06-15T10:00:00Z')
      expect(getTaskAgeLabel(createdAt)).toBeNull()
    })

    it('returns null for recent tasks (1-3 days)', () => {
      expect(getTaskAgeLabel(new Date('2024-06-14T12:00:00Z'))).toBeNull()
      expect(getTaskAgeLabel(new Date('2024-06-12T12:00:00Z'))).toBeNull()
    })

    it('returns age in days for aging tasks (4-7 days)', () => {
      expect(getTaskAgeLabel(new Date('2024-06-11T12:00:00Z'))).toBe('4d old')
      expect(getTaskAgeLabel(new Date('2024-06-10T12:00:00Z'))).toBe('5d old')
      expect(getTaskAgeLabel(new Date('2024-06-08T12:00:00Z'))).toBe('7d old')
    })

    it('returns "Aging" for stale tasks (8-14 days)', () => {
      expect(getTaskAgeLabel(new Date('2024-06-07T12:00:00Z'))).toBe('Aging')
      expect(getTaskAgeLabel(new Date('2024-06-01T12:00:00Z'))).toBe('Aging')
    })

    it('returns "Needs attention" for very stale tasks (15+ days)', () => {
      expect(getTaskAgeLabel(new Date('2024-05-31T12:00:00Z'))).toBe('Needs attention')
      expect(getTaskAgeLabel(new Date('2024-05-01T12:00:00Z'))).toBe('Needs attention')
    })
  })

  describe('getTaskAgeColor', () => {
    it('returns neutral for fresh tasks', () => {
      expect(getTaskAgeColor(new Date('2024-06-15T10:00:00Z'))).toBe('neutral')
    })

    it('returns amber for recent tasks', () => {
      expect(getTaskAgeColor(new Date('2024-06-14T12:00:00Z'))).toBe('amber')
    })

    it('returns warning for aging tasks', () => {
      expect(getTaskAgeColor(new Date('2024-06-10T12:00:00Z'))).toBe('warning')
    })

    it('returns orange for stale tasks', () => {
      expect(getTaskAgeColor(new Date('2024-06-05T12:00:00Z'))).toBe('orange')
    })

    it('returns danger for very stale tasks', () => {
      expect(getTaskAgeColor(new Date('2024-05-01T12:00:00Z'))).toBe('danger')
    })
  })

  describe('getTaskAgeInfo', () => {
    it('returns complete info object for task', () => {
      const createdAt = new Date('2024-06-10T12:00:00Z')
      const info = getTaskAgeInfo(createdAt)

      expect(info).toEqual({
        days: 5,
        hours: 120,
        category: 'aging',
        label: '5d old',
        color: 'warning',
        shouldPulse: false,
      })
    })

    it('sets shouldPulse true for very stale tasks', () => {
      const createdAt = new Date('2024-05-01T12:00:00Z')
      const info = getTaskAgeInfo(createdAt)

      expect(info.shouldPulse).toBe(true)
      expect(info.category).toBe('very-stale')
    })

    it('sets shouldPulse false for non very-stale tasks', () => {
      const categories: Date[] = [
        new Date('2024-06-15T10:00:00Z'), // fresh
        new Date('2024-06-14T12:00:00Z'), // recent
        new Date('2024-06-10T12:00:00Z'), // aging
        new Date('2024-06-05T12:00:00Z'), // stale
      ]

      categories.forEach(createdAt => {
        const info = getTaskAgeInfo(createdAt)
        expect(info.shouldPulse).toBe(false)
      })
    })
  })

  describe('isTaskAging', () => {
    it('returns false for tasks less than 4 days old', () => {
      expect(isTaskAging(new Date('2024-06-15T10:00:00Z'))).toBe(false)
      expect(isTaskAging(new Date('2024-06-14T12:00:00Z'))).toBe(false)
      expect(isTaskAging(new Date('2024-06-12T12:00:00Z'))).toBe(false)
    })

    it('returns true for tasks 4+ days old', () => {
      expect(isTaskAging(new Date('2024-06-11T12:00:00Z'))).toBe(true)
      expect(isTaskAging(new Date('2024-06-10T12:00:00Z'))).toBe(true)
      expect(isTaskAging(new Date('2024-06-01T12:00:00Z'))).toBe(true)
    })

    it('accepts string date format', () => {
      expect(isTaskAging('2024-06-11T12:00:00Z')).toBe(true)
      expect(isTaskAging('2024-06-13T12:00:00Z')).toBe(false)
    })
  })

  describe('isTaskStale', () => {
    it('returns false for tasks less than 8 days old', () => {
      expect(isTaskStale(new Date('2024-06-15T10:00:00Z'))).toBe(false)
      expect(isTaskStale(new Date('2024-06-10T12:00:00Z'))).toBe(false)
      expect(isTaskStale(new Date('2024-06-08T12:00:00Z'))).toBe(false)
    })

    it('returns true for tasks 8+ days old', () => {
      expect(isTaskStale(new Date('2024-06-07T12:00:00Z'))).toBe(true)
      expect(isTaskStale(new Date('2024-06-01T12:00:00Z'))).toBe(true)
      expect(isTaskStale(new Date('2024-05-01T12:00:00Z'))).toBe(true)
    })

    it('accepts string date format', () => {
      expect(isTaskStale('2024-06-07T12:00:00Z')).toBe(true)
      expect(isTaskStale('2024-06-10T12:00:00Z')).toBe(false)
    })
  })

  describe('getAgeIndicatorClasses', () => {
    const baseClasses = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium'

    it('returns amber classes for amber color', () => {
      expect(getAgeIndicatorClasses('amber')).toBe(`${baseClasses} bg-amber-50 text-amber-700`)
    })

    it('returns warning classes for warning color', () => {
      expect(getAgeIndicatorClasses('warning')).toBe(`${baseClasses} bg-warning-50 text-warning-600`)
    })

    it('returns orange classes for orange color', () => {
      expect(getAgeIndicatorClasses('orange')).toBe(`${baseClasses} bg-orange-50 text-orange-700`)
    })

    it('returns danger classes for danger color', () => {
      expect(getAgeIndicatorClasses('danger')).toBe(`${baseClasses} bg-danger-50 text-danger-600`)
    })

    it('returns neutral classes for neutral color', () => {
      expect(getAgeIndicatorClasses('neutral')).toBe(`${baseClasses} bg-neutral-100 text-neutral-600`)
    })
  })
})
