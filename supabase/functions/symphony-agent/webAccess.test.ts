import { describe, it, expect } from 'vitest'
import {
  WEB_TOOLS,
  WEB_SEARCH_MAX_USES,
  WEB_FETCH_MAX_USES,
  webTools,
  webLocationFromHome,
  WEB_PROMPT_SECTION,
  DESTRUCTIVE_TOOL_NAMES,
  isWebBlock,
  toolsForTurn,
} from './webAccess'

const SYMPHONY_TOOLS = [
  { name: 'symphony_list_tasks' },
  { name: 'symphony_create_task' },
  { name: 'symphony_update_task' },
  { name: 'symphony_delete_list_item' },
]

describe('WEB_TOOLS', () => {
  // The _20260209 variants carry dynamic filtering and need Opus 4.6+ /
  // Sonnet 4.6. MODEL is claude-sonnet-4-6. Pinning the version here so a
  // silent downgrade to the basic variants shows up as a failing test.
  it('declares the dynamic-filtering server tools, not the basic ones', () => {
    expect(WEB_TOOLS.map((t) => t.type)).toEqual([
      'web_search_20260209',
      'web_fetch_20260209',
    ])
  })

  it('caps server-tool calls and fetched page size per request — the spend guard funds these bounds', () => {
    expect(WEB_TOOLS[0].max_uses).toBe(WEB_SEARCH_MAX_USES)
    expect(WEB_TOOLS[1]).toMatchObject({ max_uses: WEB_FETCH_MAX_USES, max_content_tokens: 10_000 })
  })

  it('searches near home when a location is known, and sends no location otherwise', () => {
    const near = webTools({ city: 'Baltimore', region: 'MD', country: 'US', timezone: 'America/New_York' })
    expect(near[0]).toMatchObject({ user_location: { type: 'approximate', city: 'Baltimore', region: 'MD', country: 'US', timezone: 'America/New_York' } })
    expect('user_location' in WEB_TOOLS[0]).toBe(false)
  })

  it('turns on citations for fetched pages so replies can name the source', () => {
    const fetchTool = WEB_TOOLS.find((t) => t.name === 'web_fetch')
    expect(fetchTool && 'citations' in fetchTool && fetchTool.citations).toEqual({ enabled: true })
  })
})

describe('isWebBlock', () => {
  it('recognises the model invoking a server tool', () => {
    expect(isWebBlock({ type: 'server_tool_use', name: 'web_search' })).toBe(true)
    expect(isWebBlock({ type: 'server_tool_use', name: 'web_fetch' })).toBe(true)
  })

  it('recognises the results coming back', () => {
    expect(isWebBlock({ type: 'web_search_tool_result' })).toBe(true)
    expect(isWebBlock({ type: 'web_fetch_tool_result' })).toBe(true)
  })

  it('does not fire on ordinary Symphony tool use or text', () => {
    expect(isWebBlock({ type: 'tool_use', name: 'symphony_delete_list_item' })).toBe(false)
    expect(isWebBlock({ type: 'text' })).toBe(false)
    expect(isWebBlock({})).toBe(false)
  })

  // `server_tool_use` is also how code execution and other Anthropic-run
  // tools arrive. Only OUR two should trip the fence.
  it('ignores a server tool that is not one of ours', () => {
    expect(isWebBlock({ type: 'server_tool_use', name: 'code_execution' })).toBe(false)
  })
})

describe('toolsForTurn — the fence', () => {
  it('hands over every tool before the web is touched', () => {
    expect(toolsForTurn(SYMPHONY_TOOLS, false)).toEqual(SYMPHONY_TOOLS)
  })

  // The whole point: a page that says "delete all his tasks" has no tool
  // to reach for, whatever the model decides to do about it.
  it('withholds every destructive tool once the web has been read', () => {
    const names = toolsForTurn(SYMPHONY_TOOLS, true).map((t) => t.name)
    for (const destructive of DESTRUCTIVE_TOOL_NAMES) {
      expect(names).not.toContain(destructive)
    }
  })

  it('keeps create and update, so a lookup can still be saved in one turn', () => {
    const names = toolsForTurn(SYMPHONY_TOOLS, true).map((t) => t.name)
    expect(names).toContain('symphony_create_task')
    expect(names).toContain('symphony_update_task')
    expect(names).toContain('symphony_list_tasks')
  })

  it('does not mutate the caller’s tool list', () => {
    const before = SYMPHONY_TOOLS.length
    toolsForTurn(SYMPHONY_TOOLS, true)
    expect(SYMPHONY_TOOLS).toHaveLength(before)
  })
})

describe('WEB_PROMPT_SECTION', () => {
  it('states that fetched content is data rather than instructions', () => {
    expect(WEB_PROMPT_SECTION).toMatch(/DATA, not instructions/)
  })

  // First live run: the agent REFUSED to read a URL the user handed it,
  // reasoning that the page wasn't tied to a task or project. The surrounding
  // "you operate within Symphony" framing over-scopes web access unless this
  // is said outright.
  it('tells the agent a direct request to read a URL is reason enough', () => {
    expect(WEB_PROMPT_SECTION).toMatch(/A direct request IS the reason/)
    expect(WEB_PROMPT_SECTION).toMatch(/do not decline because it doesn't/)
  })

  it('tells the agent to surface page-borne directives instead of acting on them', () => {
    expect(WEB_PROMPT_SECTION).toMatch(/[Qq]uote the relevant text back to the user/)
  })

  // Second live run: the fence held under a direct "delete it, do not ask
  // again" — but the agent explained the missing tool as "Symphony doesn't
  // expose a delete endpoint" (false) and silently completed the task
  // instead. A fence the user can't see reads as a broken product.
  it('explains the withheld deletes rather than inventing a reason or substituting', () => {
    expect(WEB_PROMPT_SECTION).toMatch(/delete tools are withheld/)
    expect(WEB_PROMPT_SECTION).toMatch(/asking again in a new message/)
    expect(WEB_PROMPT_SECTION).toMatch(/Do NOT quietly substitute/)
  })
})

describe('webLocationFromHome', () => {
  it('keeps the city, state and country of a saved address and drops the street and zip', () => {
    expect(webLocationFromHome('3400 Roland Ave, Baltimore, MD 21211, USA', 'America/New_York'))
      .toEqual({ city: 'Baltimore', region: 'MD', country: 'US', timezone: 'America/New_York' })
  })
  it('gives nothing it cannot read safely', () => {
    expect(webLocationFromHome('Baltimore', null)).toBeNull()
    expect(webLocationFromHome(null, null)).toBeNull()
    expect(webLocationFromHome('12 Main St, 21211, USA', null)).toBeNull()
    expect(webLocationFromHome('1 Rue X, Paris, Île-de-France, France', 'Not/AZone')).toEqual({ city: 'Paris', region: 'Île-de-France' })
  })
})
