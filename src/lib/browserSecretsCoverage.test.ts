// Guard: no secret may be a VITE_ variable. Vite inlines every
// import.meta.env.VITE_* value into the public bundle, readable by anyone who
// loads the site. VITE_OPEN_BRAIN_API_KEY shipped that way until 2026-10-10
// (Open Brain has since been removed from Symphony).
//
// Allowed by design: the Supabase URL and anon key (RLS is the gate), the
// Sentry DSN, and the Google Maps browser key (restricted to the site's
// referrers in Google Cloud). Anything else that looks like a key, token,
// secret or password must live in an edge function secret instead.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PUBLIC_BY_DESIGN = new Set(['VITE_SUPABASE_ANON_KEY', 'VITE_GOOGLE_MAPS_API_KEY'])
const SECRET_LIKE = /KEY|TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : []
  })
}

describe('browser bundle secrets', () => {
  it('reads no secret-looking VITE_ variable outside the public-by-design set', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const [, name] of code.matchAll(/\b(VITE_[A-Z0-9_]+)/g)) {
        if (SECRET_LIKE.test(name) && !PUBLIC_BY_DESIGN.has(name)) offenders.push(`${file}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
