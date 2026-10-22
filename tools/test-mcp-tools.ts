#!/usr/bin/env npx tsx
/**
 * Integration check: boots the MCP server and verifies the meal-domain tools exist,
 * then does a reversible live round-trip (add + remove an ad-hoc meal entry).
 *
 * Run: npx tsx tools/test-mcp-tools.ts   (requires SUPABASE_* env vars — real sign-in)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const EXPECTED = [
  'symphony_list_recipes', 'symphony_get_recipe', 'symphony_create_recipe',
  'symphony_get_week_plan', 'symphony_add_meal_entry', 'symphony_remove_meal_entry',
  'symphony_list_lists', 'symphony_add_list_item',
  'symphony_get_note_by_title', 'symphony_upsert_note',
  'symphony_list_choices', 'symphony_add_option', 'symphony_set_price_line', 'symphony_update_option',
]

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', new URL('./symphony-mcp-server.ts', import.meta.url).pathname],
  env: { ...process.env } as Record<string, string>,
})
const client = new Client({ name: 'meal-tools-check', version: '1.0.0' })
await client.connect(transport)

const { tools } = await client.listTools()
const names = new Set(tools.map(t => t.name))
const missing = EXPECTED.filter(n => !names.has(n))
if (missing.length) {
  console.error(`MISSING TOOLS (${missing.length}):\n` + missing.join('\n'))
  process.exit(1)
}
console.log(`OK — all ${EXPECTED.length} expected tools registered (${tools.length} total).`)

// Live round-trip: list recipes, then add + remove an ad-hoc entry on this week's plan.
const text = (r: Awaited<ReturnType<typeof client.callTool>>) =>
  (r.content as Array<{ type: string; text: string }>)[0]?.text ?? ''

const recipes = await client.callTool({ name: 'symphony_list_recipes', arguments: { limit: 3 } })
if (text(recipes).startsWith('Error:')) { console.error('list_recipes failed: ' + text(recipes)); process.exit(1) }
console.log('symphony_list_recipes: OK')

const now = new Date()
const sunday = new Date(now)
sunday.setDate(now.getDate() - now.getDay())
const weekStart = sunday.toISOString().split('T')[0]

const added = await client.callTool({
  name: 'symphony_add_meal_entry',
  arguments: { week_start: weekStart, day_of_week: 6, slot: 'dinner', ad_hoc_title: 'MCP smoke test' },
})
const addedText = text(added)
if (addedText.startsWith('Error:')) { console.error('add_meal_entry failed: ' + addedText); process.exit(1) }
const entryId = JSON.parse(addedText).id as string
console.log(`symphony_add_meal_entry: OK (${entryId})`)

// Reading the week back catches selects of dropped columns (family_member_id broke this in July).
const week = await client.callTool({ name: 'symphony_get_week_plan', arguments: { week_start: weekStart } })
const weekText = text(week)
const readBack = !weekText.startsWith('Error:') &&
  (JSON.parse(weekText).entries as Array<{ id: string }>).some(e => e.id === entryId)
if (!readBack) {
  console.error('get_week_plan failed: ' + weekText)
  await client.callTool({ name: 'symphony_remove_meal_entry', arguments: { id: entryId } })
  process.exit(1)
}
console.log('symphony_get_week_plan: OK')

const removed = await client.callTool({ name: 'symphony_remove_meal_entry', arguments: { id: entryId } })
if (text(removed).startsWith('Error:')) { console.error('remove_meal_entry failed: ' + text(removed)); process.exit(1) }
console.log('symphony_remove_meal_entry: OK — round-trip clean.')

// Choices (read-only here: writes need a real choice, so they are checked for clean error text on bogus ids).
const choices = await client.callTool({ name: 'symphony_list_choices', arguments: {} })
const choicesText = text(choices)
if (choicesText.startsWith('Error:') || !Array.isArray(JSON.parse(choicesText).choices)) { console.error('list_choices failed: ' + choicesText); process.exit(1) }
console.log('symphony_list_choices: OK')

const BOGUS = '00000000-0000-0000-0000-000000000000'
for (const [name, args] of [
  ['symphony_add_option', { choice_id: BOGUS, name: 'MCP smoke test' }],
  ['symphony_set_price_line', { option_id: BOGUS, work_labels: ['x'], amount: 1 }],
  ['symphony_update_option', { option_id: BOGUS, status: 'contacted' }],
] as const) {
  const r = text(await client.callTool({ name, arguments: args }))
  if (!r.startsWith('Error:')) { console.error(`${name} should reject a bogus id, got: ${r}`); process.exit(1) }
  console.log(`${name}: OK (rejects bogus id)`)
}

await client.close()
