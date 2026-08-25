import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = resolve('connectors/src')

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...await sourceFiles(full))
    else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) out.push(full)
  }
  return out
}

/**
 * The worker runs under `node --experimental-strip-types`, which erases types
 * without compiling them. A few TS constructs it cannot handle — parameter
 * properties, enums, namespaces — type-check cleanly and then crash at boot
 * on the server. tsc will not tell you; `node --check` will not either, since
 * it does not run the transform. Actually importing the module does.
 *
 * Entrypoints (index.ts, otcLogin.ts) run on import, so they are launched with
 * a scrubbed environment: loadConfig throws immediately and the process exits
 * before it can open a socket or wait on stdin. Only ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX
 * counts as a failure here — every other error is the module doing its job.
 */
describe('every worker module survives type stripping', () => {
  it('loads under --experimental-strip-types', async () => {
    const files = await sourceFiles(ROOT)
    expect(files.length).toBeGreaterThan(5)

    const env = { ...process.env }
    for (const k of Object.keys(env)) {
      if (/^(SUPABASE_|CAPTURE_|CLASSDOJO_|STATE_DIR|FLUSH_|HOUSEHOLD_)/.test(k)) delete env[k]
    }

    const failures: string[] = []
    for (const f of files) {
      try {
        await run(process.execPath, [
          '--experimental-strip-types',
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(f)})`,
        ], { cwd: resolve('connectors'), env, timeout: 15_000 })
      } catch (e) {
        const stderr = (e as { stderr?: string }).stderr ?? String(e)
        if (stderr.includes('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX')) {
          const line = stderr.split('\n').find((l) => l.includes('not supported')) ?? 'strip failure'
          failures.push(`${f}: ${line.trim()}`)
        }
      }
    }
    expect(failures).toEqual([])
  }, 180_000)
})
