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
    // index.ts is the composition root — importing it would start the worker.
    else if (e.name.endsWith('.ts') && !e.name.includes('.test.') && e.name !== 'index.ts') {
      out.push(full)
    }
  }
  return out
}

/**
 * The worker runs under `node --experimental-strip-types`, which erases types
 * without compiling them. A few TS constructs it cannot handle — parameter
 * properties, enums, namespaces — type-check cleanly and then crash at boot
 * on the server. tsc will not tell you; `node --check` will not either, since
 * it does not run the transform. Actually importing the module does.
 */
describe('every worker module survives type stripping', () => {
  it('loads under --experimental-strip-types', async () => {
    const files = await sourceFiles(ROOT)
    expect(files.length).toBeGreaterThan(5)

    const failures: string[] = []
    for (const f of files) {
      try {
        await run(process.execPath, [
          '--experimental-strip-types',
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(f)})`,
        ], { cwd: resolve('connectors') })
      } catch (e) {
        const stderr = (e as { stderr?: string }).stderr ?? String(e)
        const line = stderr.split('\n').find((l) => l.includes('Error')) ?? stderr.slice(0, 200)
        failures.push(`${f}: ${line}`)
      }
    }
    expect(failures).toEqual([])
  }, 120_000)
})
