import { describe, it, expect } from 'vitest'
import { extractProjectTag } from './projectTag'
import type { Project } from '@/types/project'

const projects = [
  { id: 'p1', name: 'Kitchen Renovation' },
  { id: 'p2', name: 'Summer Trip' },
] as unknown as Project[]

describe('extractProjectTag', () => {
  it('matches a prefix tag case-insensitively and strips it', () => {
    expect(extractProjectTag('order dishwasher #kitchen', projects)).toEqual({
      title: 'order dishwasher',
      projectId: 'p1',
    })
  })

  it('matches ignoring spaces in the project name', () => {
    expect(extractProjectTag('#summertrip book flights', projects)).toEqual({
      title: 'book flights',
      projectId: 'p2',
    })
  })

  it('leaves unmatched tags in the title', () => {
    expect(extractProjectTag('ship the #v2 launch', projects)).toEqual({
      title: 'ship the #v2 launch',
    })
  })

  it('never eats date-like words (not a quick-input parse)', () => {
    expect(extractProjectTag('book summer trip for next month', projects)).toEqual({
      title: 'book summer trip for next month',
    })
  })

  it('handles no projects and plain text', () => {
    expect(extractProjectTag('  just a line  ', [])).toEqual({ title: 'just a line' })
  })
})
