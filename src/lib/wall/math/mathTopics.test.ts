import { describe, expect, it } from 'vitest'
import { parseTopics, toggleTopic, topicFor, topicLabels } from './mathTopics'

describe('topics', () => {
  it('keeps known topics, three at most', () => {
    expect(parseTopics(['space', 'nope', 'space', 'art', 'music', 'soccer'])).toEqual(['space', 'art', 'music'])
    expect(parseTopics(null)).toEqual([])
  })
  it('a tap turns one on or off; a fourth replaces the oldest', () => {
    expect(toggleTopic([], 'space')).toEqual(['space'])
    expect(toggleTopic(['space'], 'space')).toEqual([])
    expect(toggleTopic(['space', 'art', 'music'], 'soccer')).toEqual(['art', 'music', 'soccer'])
    expect(toggleTopic(['space'], 'nope')).toEqual(['space'])
  })
  it('picks one of the kid’s topics per problem, the same each time', () => {
    const t = topicFor(['space', 'art'], 'ella', '2026-10-20', 0)
    expect(['space', 'art']).toContain(t?.id)
    expect(topicFor(['space', 'art'], 'ella', '2026-10-20', 0)).toEqual(t)
    expect(topicFor([], 'ella', '2026-10-20', 0)).toBeNull()
  })
  it('names them for people', () => {
    expect(topicLabels(['games', 'space'])).toEqual(['Video games', 'Space'])
  })
})
