import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolOutcome } from './canvasEvents'
import { PROPOSE_CHANGES_TOOL } from './changeSet'
import { POINT_TOOL } from './pointing'
import { READ_WEEK_TOOL } from './readWeek'
import {
  SCRATCHPAD_TOOL, WALL_PROMPT_SECTION, WALL_TOOL_NAMES, WALL_WRITE_TOOLS,
  addToScratchpad, familyCalendars, fenceDb, loadWallFence, parseSurface,
  systemForSurface, toolAllowed, toolsForSurface, wallClockLine, type WallFence,
} from './wallMode'

const source = readFileSync('supabase/functions/symphony-agent/index.ts', 'utf8')
const FAMILY_LIST = '11111111-1111-4111-8111-111111111111'
const fence: WallFence = { familyCalendarIds: ['family-cal'], familyListIds: [FAMILY_LIST] }

/** A query builder that records every call made on it, like postgrest-js. */
function recorder() {
  const calls: unknown[][] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'is', 'order', 'limit', 'ilike', 'insert']) {
    builder[m] = (...args: unknown[]) => { calls.push([m, ...args]); return builder }
  }
  builder.single = () => Promise.resolve({ data: { id: 'n1' }, error: null })
  const db = { from: (table: string) => { calls.push(['from', table]); return builder } }
  return { db, calls }
}

describe('parseSurface', () => {
  it('absent means the desktop/phone agent', () => {
    expect(parseSurface(undefined)).toEqual({ surface: null })
    expect(parseSurface(null)).toEqual({ surface: null })
  })
  it('accepts wall and nothing else', () => {
    expect(parseSurface('wall')).toEqual({ surface: 'wall' })
    expect(parseSurface('desk')).toHaveProperty('error')
    expect(parseSurface('WALL')).toHaveProperty('error')
    expect(parseSurface(1)).toHaveProperty('error')
  })
})

describe('desktop is unchanged without a surface', () => {
  const tools = [{ name: 'symphony_create_task' }, { name: 'symphony_list_tasks' }]
  it('tools, system prompt and db client come back as the very same objects', () => {
    expect(toolsForSurface(tools, null)).toBe(tools)
    const base = 'You are the assistant inside Symphony.'
    expect(systemForSurface(base, null)).toBe(base)
    const db = { from: () => ({}) }
    expect(fenceDb(db, null)).toBe(db)
    expect(toolAllowed('symphony_update_task', null)).toBe(true)
  })
  it('toolOutcome keeps its desktop write list by default', () => {
    // Reads report nothing; every write on the desktop list reports.
    expect(toolOutcome('symphony_list_tasks', '[]')).toBeNull()
    expect(toolOutcome('symphony_add_list_item', '{"id":"a"}')).toEqual({ type: 'tool_result', name: 'symphony_add_list_item', ok: true, ids: ['a'] })
    expect(toolOutcome('symphony_create_task', '{"id":"a"}')).toEqual({ type: 'tool_result', name: 'symphony_create_task', ok: true, ids: ['a'] })
  })
  it('index.ts gates every wall difference on surface', () => {
    expect(source).toContain("const tdb = wall ? fenceDb(db, await loadWallFence(db, user.id)) : db")
    expect(source).toContain('const workspaceContext = wall ? undefined : body.workspaceContext')
    expect(source).toContain('toolsForTurn(toolsForSurface(TOOLS, surface), webTouched)')
    expect(source).toContain('text: systemForSurface(SYSTEM_PROMPT, surface)')
    expect(source).toContain("toolOutcome(block.name, result, wall ? WALL_WRITE_TOOLS : undefined)")
    // The page context is read once, and never on the wall.
    expect(source.match(/body\.workspaceContext/g)).toHaveLength(1)
  })
})

describe('wall tools', () => {
  it('every wall tool name is a real tool', () => {
    for (const name of WALL_TOOL_NAMES) {
      if ([SCRATCHPAD_TOOL, PROPOSE_CHANGES_TOOL, POINT_TOOL, READ_WEEK_TOOL].some((t) => t.name === name)) continue
      expect(source, name).toMatch(new RegExp(`name:\\s*'${name}'`))
    }
  })
  it('offers reads, the change card, pointing and the two safe writes only', () => {
    const all = [...source.matchAll(/name:\s*'(symphony_[a-z_]+)'/g)].map((m) => ({ name: m[1] }))
    const offered = toolsForSurface([...all, PROPOSE_CHANGES_TOOL, POINT_TOOL, READ_WEEK_TOOL], 'wall').map((t) => t.name)
    expect(offered).toContain('symphony_propose_changes')
    expect(offered).toContain('symphony_read_week')
    expect(offered).toContain('symphony_add_list_item')
    expect(offered).toContain(SCRATCHPAD_TOOL.name)
    for (const direct of ['symphony_create_task', 'symphony_update_task', 'symphony_complete_task',
      'symphony_update_routine', 'symphony_create_routine', 'symphony_create_calendar_event',
      'symphony_create_plan_item', 'symphony_delete_list_item', 'symphony_check_list_item', 'symphony_create_list',
      'symphony_create_note', 'symphony_draft_email']) {
      expect(offered, direct).not.toContain(direct)
      expect(toolAllowed(direct, 'wall'), direct).toBe(false)
    }
    for (const priv of ['symphony_search_notes', 'symphony_search_email', 'symphony_read_email_thread', 'symphony_list_intentions', 'symphony_list_contacts']) {
      expect(offered, priv).not.toContain(priv)
    }
  })
  it('the prompt section speaks to the kitchen and routes changes to the card', () => {
    const sys = systemForSurface('BASE', 'wall')
    expect(sys.startsWith('BASE\n\n')).toBe(true)
    expect(WALL_PROMPT_SECTION).toMatch(/symphony_propose_changes/)
    expect(WALL_PROMPT_SECTION).toMatch(/talk-about/)
    expect(WALL_PROMPT_SECTION).toMatch(/one or two short spoken sentences/)
    expect(WALL_PROMPT_SECTION).toMatch(/Never mention, hint at or count anything private/)
  })
  it('reports the wall saves so the wall can Undo them', () => {
    expect(toolOutcome('symphony_add_list_item', '{"id":"i1"}', WALL_WRITE_TOOLS)).toEqual({ type: 'tool_result', name: 'symphony_add_list_item', ok: true, ids: ['i1'] })
  })
})

describe('fenceDb', () => {
  it('narrows tasks, routines and projects to the Family life area', () => {
    for (const table of ['tasks', 'routines', 'projects']) {
      const { db, calls } = recorder()
      fenceDb(db, fence).from(table).select('*').order('x')
      expect(calls).toEqual([['from', table], ['select', '*'], ['eq', 'context', 'family'], ['order', 'x']])
    }
  })
  it('narrows events to family calendars, lists to family lists and their items', () => {
    let r = recorder()
    fenceDb(r.db, fence).from('calendar_events').select('id')
    expect(r.calls).toContainEqual(['in', 'calendar_id', ['family-cal']])
    r = recorder()
    fenceDb(r.db, fence).from('lists').select('id')
    expect(r.calls).toContainEqual(['eq', 'visibility', 'family'])
    r = recorder()
    fenceDb(r.db, fence).from('list_items').select('id')
    expect(r.calls).toContainEqual(['in', 'list_id', [FAMILY_LIST]])
  })
  it('an empty id set matches nothing rather than everything', () => {
    const r = recorder()
    fenceDb(r.db, { familyCalendarIds: [], familyListIds: [] }).from('calendar_events').select('id')
    expect(r.calls).toContainEqual(['in', 'calendar_id', ['00000000-0000-0000-0000-000000000000']])
  })
  it('refuses tables with no family layer', () => {
    for (const table of ['goals', 'notes', 'contacts', 'attachments', 'task_commitments', 'calendar_domain_mappings']) {
      const { db } = recorder()
      expect(() => fenceDb(db, fence).from(table).select('*'), table).toThrow(/kitchen wall/)
    }
    const { db } = recorder()
    expect(() => (fenceDb(db, fence) as unknown as { rpc: () => void }).rpc()).toThrow(/kitchen wall/)
  })
  it('refuses updates, deletes and inserts beyond the two safe ones', () => {
    const { db } = recorder()
    const f = fenceDb(db, fence) as unknown as { from: (t: string) => Record<string, (...a: unknown[]) => unknown> }
    expect(() => f.from('tasks').update({ title: 'x' })).toThrow(/kitchen wall/)
    expect(() => f.from('routines').update({ time_of_day: '18:30' })).toThrow(/kitchen wall/)
    expect(() => f.from('tasks').delete()).toThrow(/kitchen wall/)
    expect(() => f.from('list_items').delete()).toThrow(/kitchen wall/)
    expect(() => f.from('tasks').insert({ title: 'x' })).toThrow(/kitchen wall/)
    expect(() => f.from('list_items').insert({ list_id: 'private-list', text: 'x' })).toThrow(/kitchen wall/)
    expect(() => f.from('list_items').insert({ list_id: FAMILY_LIST, text: 'milk' })).not.toThrow()
    expect(() => f.from('scratchpad_notes').insert({ body: 'x', kind: 'talk' })).not.toThrow()
  })
})

describe('wallClockLine', () => {
  it('gives the household clock and says tool times are UTC', () => {
    const line = wallClockLine(new Date('2026-10-14T23:30:00Z'), 'America/New_York')
    expect(line).toContain('Wednesday, October 14, 2026 at 7:30 PM')
    expect(line).toContain('Times in tool results are UTC')
  })
})

describe('familyCalendars', () => {
  it('keeps calendars mapped only to family', () => {
    expect(familyCalendars([
      { calendar_id: 'fam', domain: 'family' },
      { calendar_id: 'work', domain: 'work' },
      { calendar_id: 'both', domain: 'family' },
      { calendar_id: 'both', domain: 'personal' },
    ])).toEqual(['fam'])
  })
})

describe('loadWallFence', () => {
  it('reads the caller’s mappings and the family lists; an error leaves a set empty', async () => {
    const db = {
      from: (table: string) => ({
        select: () => ({
          eq: () => Promise.resolve(table === 'lists'
            ? { data: [{ id: FAMILY_LIST }], error: null }
            : { data: null, error: { message: 'boom' } }),
        }),
      }),
    }
    expect(await loadWallFence(db, 'u1')).toEqual({ familyCalendarIds: [], familyListIds: [FAMILY_LIST] })
  })
})

describe('addToScratchpad', () => {
  it('posts a talk-about with no author', async () => {
    const { db, calls } = recorder()
    const out = await addToScratchpad(fenceDb(db, fence), 'u1', { text: ' Can Max come over Saturday? ', kind: 'talk' })
    expect(calls).toContainEqual(['insert', { user_id: 'u1', body: 'Can Max come over Saturday?', kind: 'talk', author_member_id: null }])
    expect(JSON.parse(out)).toEqual({ id: 'n1' })
  })
  it('needs text and a kind', async () => {
    const { db } = recorder()
    expect(await addToScratchpad(db, 'u1', { text: 'x' })).toMatch(/^Error/)
    expect(await addToScratchpad(db, 'u1', { kind: 'talk' })).toMatch(/^Error/)
  })
})
