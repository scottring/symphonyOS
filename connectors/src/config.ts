import type { Config } from './types.ts'

function required(env: Record<string, string | undefined>, name: string): string {
  const v = env[name]
  if (!v || v.trim() === '') {
    // Fail loudly at boot. A connector that starts with a missing secret
    // looks alive and silently never delivers — the exact failure this
    // whole feature exists to avoid.
    throw new Error(`missing required env var: ${name}`)
  }
  return v
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return {
    supabaseUrl: required(env, 'SUPABASE_URL'),
    serviceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    captureSecret: required(env, 'CAPTURE_SHARED_SECRET'),
    userEmail: required(env, 'CAPTURE_USER_EMAIL'),
    userId: required(env, 'CAPTURE_USER_ID'),
    timezone: env.HOUSEHOLD_TIMEZONE ?? 'America/New_York',
    stateDir: env.STATE_DIR ?? '/data',
    flushHoursLocal: (env.FLUSH_HOURS_LOCAL ?? '12,20')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23),
    classdojoEmail: env.CLASSDOJO_EMAIL,
    classdojoPassword: env.CLASSDOJO_PASSWORD,
  }
}
