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

// Values that are obviously copied out of documentation rather than filled
// in. A placeholder email is not a harmless typo: it is a real address
// belonging to someone else, and the connector will sit there attempting
// logins against a stranger's account and reporting "incorrect password".
const PLACEHOLDERS = [
  'you@example.com', 'you@gmail.com', 'user@example.com',
  'the-current-password', 'your-password', 'your-password-here', 'changeme',
  '...', '<email>', '<password>',
]

function rejectPlaceholder(name: string, value: string | undefined): void {
  if (value && PLACEHOLDERS.includes(value.trim().toLowerCase())) {
    throw new Error(
      `${name} is set to the placeholder "${value}" — replace it with the real value`,
    )
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  rejectPlaceholder('CLASSDOJO_EMAIL', env.CLASSDOJO_EMAIL)
  rejectPlaceholder('CLASSDOJO_PASSWORD', env.CLASSDOJO_PASSWORD)
  rejectPlaceholder('CAPTURE_USER_EMAIL', env.CAPTURE_USER_EMAIL)

  return {
    supabaseUrl: required(env, 'SUPABASE_URL'),
    serviceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    captureSecret: required(env, 'CAPTURE_SHARED_SECRET'),
    userEmail: required(env, 'CAPTURE_USER_EMAIL'),
    userId: required(env, 'CAPTURE_USER_ID'),
    timezone: env.HOUSEHOLD_TIMEZONE ?? 'America/New_York',
    stateDir: env.STATE_DIR ?? '/data',
    flushHoursLocal: (env.FLUSH_HOURS_LOCAL ?? '17')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23),
    digestTo: (env.DIGEST_TO ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.includes('@')),
    classdojoEmail: env.CLASSDOJO_EMAIL,
    classdojoPassword: env.CLASSDOJO_PASSWORD,
    classdojoCookie: env.CLASSDOJO_COOKIE,
  }
}
