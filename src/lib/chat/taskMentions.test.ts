import { describe, it, expect } from 'vitest'
import { matchTaskMention, splitListLines } from './taskMentions'
import type { Task } from '@/types/task'

const task = (id: string, title: string, completed = false) =>
  ({ id, title, completed, createdAt: new Date() }) as Task

describe('which task a line of the reply names', () => {
  const tasks = [
    task('kids', 'Pick up the kids'),
    task('posters', 'Frame the posters'),
    task('slip', 'Return field trip permission slip'),
    task('gym', 'Gym'),
  ]

  it('names a task by its title, alone or with a note after it', () => {
    expect(matchTaskMention('Frame the posters', tasks)?.id).toBe('posters')
    expect(matchTaskMention('Pick up the kids — early release', tasks)?.id).toBe('kids')
    expect(matchTaskMention('**Return field trip permission slip** (due Monday)', tasks)?.id).toBe('slip')
    expect(matchTaskMention('Pick up the kids - early release', tasks)?.id).toBe('kids')
  })

  it('names nothing when the title is only part of other words', () => {
    expect(matchTaskMention('Pick up the kidsroom paint', tasks)).toBeNull()
    expect(matchTaskMention('Ask Iris to pick up the kids', tasks)).toBeNull()
    // Too short to tell from a word in a sentence.
    expect(matchTaskMention('Gym', tasks)).toBeNull()
  })

  it('prefers the open task of the same title, and refuses to guess between two open ones', () => {
    const done = task('old', 'Frame the posters', true)
    expect(matchTaskMention('Frame the posters', [done, tasks[1]])?.id).toBe('posters')
    expect(matchTaskMention('Frame the posters', [done])?.id).toBe('old')
    expect(matchTaskMention('Frame the posters', [tasks[1], task('again', 'Frame the posters')])).toBeNull()
  })

  it('splits list lines from the rest, keeping their markers', () => {
    const lines = splitListLines('**From last week:**\n- Frame the posters\n2. Pick up the kids')
    expect(lines[0]).toEqual({ line: '**From last week:**' })
    expect(lines[1]).toMatchObject({ marker: '- ', text: 'Frame the posters' })
    expect(lines[2]).toMatchObject({ marker: '2. ', text: 'Pick up the kids' })
  })
})
