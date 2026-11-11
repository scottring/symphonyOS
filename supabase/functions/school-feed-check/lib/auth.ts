// Who may run the check: the scheduler only.
//
// The cron job sends the service key it holds in Vault, the legacy JWT. The
// function's own SUPABASE_SERVICE_ROLE_KEY may be the newer secret-key form,
// so the two strings need not match (2026-11-11: every call got a 401). The
// gateway verifies the JWT's signature before the function runs (verify_jwt
// is on for this function in config.toml), so a verified token whose role is
// service_role is the scheduler.

function jwtRole(token: string): string | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const role = (JSON.parse(atob(b64)) as { role?: unknown }).role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

export function isScheduler(authorization: string | null, serviceKey: string): boolean {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return false
  if (serviceKey && token === serviceKey) return true
  return jwtRole(token) === 'service_role'
}
