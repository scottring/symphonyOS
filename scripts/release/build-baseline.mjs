// Reproducible production packaging. Only public VITE configuration enters the
// build; the test allowlist and temporary planner are always disabled here.
import { readFileSync, mkdirSync, cpSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const envPath = process.argv[2]
const stage = resolve(process.argv[3] || '/tmp/symphony-production-baseline-20261016')
assert.ok(envPath, 'Pass the existing production public environment file path.')
const config = Object.fromEntries(readFileSync(envPath, 'utf8').split('\n')
  .filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')]))
assert.ok(config.VITE_SUPABASE_URL && config.VITE_SUPABASE_ANON_KEY)
const env = { ...process.env, ...Object.fromEntries(Object.entries(config).filter(([k]) => k.startsWith('VITE_'))),
  VITE_AGENT_FUNCTION: 'symphony-agent', VITE_TEST_ACCOUNT_IDS: '', VITE_TEST_VERSION: '', VITE_VOICE_FUNCTION: 'workspace-voice' }
execFileSync(process.execPath, [root + '/node_modules/typescript/bin/tsc', '-b'], { cwd: root, env, stdio: 'inherit' })
execFileSync(process.execPath, [root + '/node_modules/vite/bin/vite.js', 'build'], { cwd: root, env, stdio: 'inherit' })
mkdirSync(stage + '/.vercel/output', { recursive: true })
rmSync(stage + '/.vercel/output/static', { recursive: true, force: true })
cpSync(root + '/dist', stage + '/.vercel/output/static', { recursive: true })
const assets = stage + '/.vercel/output/static/assets'
for (const name of readdirSync(assets)) {
  if (name.endsWith('.map')) { rmSync(assets + '/' + name); continue }
  if (!name.endsWith('.js')) continue
  const content = readFileSync(assets + '/' + name, 'utf8')
  for (const forbidden of ['symphony-conversation-bench', 'calendar_accounts', 'save_calendar_selections', 'deb3b752-cb26-480a-910c-fb174b308409']) {
    assert.ok(!content.includes(forbidden), `Excluded test/calendar code in ${name}: ${forbidden}`)
  }
}
const routing = JSON.parse(readFileSync(root + '/vercel.json', 'utf8'))
const headers = routing.headers.map(h => ({ src: h.source, headers: Object.fromEntries(h.headers.map(x => [x.key, x.value])), continue: true }))
writeFileSync(stage + '/.vercel/output/config.json', JSON.stringify({ version: 3, routes: [...headers, { handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }] }, null, 2))
const version = { version: '2026-10-16.6-baseline', basedOn: '2026-10-16.5', agent: 'symphony-agent', accountAccess: 'authenticated', multiAccountCalendars: false, builtAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }
writeFileSync(stage + '/.vercel/output/static/release-version.json', JSON.stringify(version))
console.log('Production baseline packaged with normal account access; temporary planner and multi-account calendar code excluded.')
