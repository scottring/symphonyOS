import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEntityRelations } from './useEntityRelations'
import { createMockTask, createMockContact, createMockProject } from '@/test/mocks/factories'

describe('useEntityRelations', () => {
  describe('contact', () => {
    it('returns tasks linked via contactId', () => {
      const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
      const linked = createMockTask({ id: 't1', contactId: 'c1', completed: false })
      const unrelated = createMockTask({ id: 't2', contactId: 'c9' })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'contact',
        entity: contact,
        allTasks: [linked, unrelated],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t1'])
    })

    it('excludes completed tasks by default', () => {
      const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
      const done = createMockTask({ id: 't1', contactId: 'c1', completed: true })
      const open = createMockTask({ id: 't2', contactId: 'c1', completed: false })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'contact',
        entity: contact,
        allTasks: [done, open],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t2'])
    })
  })

  describe('project', () => {
    it('returns open tasks tagged with the project', () => {
      const project = createMockProject({ id: 'p1', name: 'Liam Health' })
      const open = createMockTask({ id: 't1', projectId: 'p1', completed: false })
      const done = createMockTask({ id: 't2', projectId: 'p1', completed: true })
      const other = createMockTask({ id: 't3', projectId: 'p2' })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'project',
        entity: project,
        allTasks: [open, done, other],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t1'])
    })
  })

  describe('event', () => {
    it('returns prep tasks linked via linkedEventId', () => {
      const event = { id: 'e1', title: 'Annual physical' } as any
      const prep = createMockTask({ id: 't1', linkedEventId: 'e1' })
      const other = createMockTask({ id: 't2' })
      const { result } = renderHook(() => useEntityRelations({
        kind: 'event',
        entity: event,
        allTasks: [prep, other],
        allEvents: [],
        allProjects: [],
      }))
      expect(result.current.tasks.map(t => t.id)).toEqual(['t1'])
    })
  })
})
