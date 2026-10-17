import { readFileSync } from 'node:fs'
const { entries } = JSON.parse(readFileSync(new URL('./coverage.json', import.meta.url), 'utf8'))
console.log('Catalog coverage — supporting tests are not end-to-end certification\n')
for (const entry of entries) console.log(`${entry.id} | ${entry.intent} | ${entry.automation} | ${entry.scenarios.join(', ') || 'no executable journey yet'}`)
console.log(`\n${entries.filter(e => e.kind === 'transaction').length} transactions; ${entries.filter(e => e.kind === 'shared').length} shared behaviors. Audio/model quality remains unmeasured until live replay.`)
