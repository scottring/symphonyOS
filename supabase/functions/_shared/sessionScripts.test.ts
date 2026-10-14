import { describe, expect, it } from 'vitest'
import { EVERYDAY_TALK_RULES, HARD_RULES, MONTH_SEASON_YEAR_NOTE, SESSION_SPINE_PREAMBLE, WEEKLY_PLANNING_SCRIPT } from './sessionScripts'

describe('session scripts', () => {
  it('holds the spine, the hard rules and the seven steps', () => {
    expect(SESSION_SPINE_PREAMBLE).toContain('Sessions follow a spine, not a script')
    expect(HARD_RULES.split('\n')).toHaveLength(6)
    expect(WEEKLY_PLANNING_SCRIPT).toContain("Let's plan the week of Oct 17")
    expect(WEEKLY_PLANNING_SCRIPT.split('\n')).toHaveLength(8)
    expect(HARD_RULES).toContain('more than three items')
    expect(WEEKLY_PLANNING_SCRIPT).toContain('if three or fewer, name them')
    expect(WEEKLY_PLANNING_SCRIPT).toContain('things-to-talk-about list and leave it without a day')
    expect(EVERYDAY_TALK_RULES).toContain('"this afternoon" → 2pm')
    expect(MONTH_SEASON_YEAR_NOTE).toContain('never invent them')
  })
})
