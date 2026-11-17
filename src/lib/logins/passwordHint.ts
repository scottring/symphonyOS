// A password hint is a masked reminder ("T*********01"), never the password.
// The real password stays in Apple Passwords; Symphony keeps only the hint.

/** Mask a password, keeping the first character and the last one or two. */
export function maskPassword(password: string): string {
  const chars = [...password]
  const n = chars.length
  if (n === 0) return ''
  if (n <= 3) return '*'.repeat(n)
  const tail = n >= 8 ? 2 : 1
  return chars[0] + '*'.repeat(n - 1 - tail) + chars.slice(n - tail).join('')
}

/** The site's address made openable: "comcast.com" → "https://comcast.com". */
export function openableUrl(url: string | null | undefined): string | null {
  const u = url?.trim()
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null // javascript:, mailto: and friends
  return `https://${u}`
}

/** The bare host to show under a site: "https://www.comcast.com/login" → "comcast.com". */
export function displayHost(url: string | null | undefined): string | null {
  const open = openableUrl(url)
  if (!open) return null
  try {
    return new URL(open).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface LoginLike {
  site: string
  url: string | null
  username: string | null
  notes: string | null
}

/** True when every word of the query is found in the site, address, username or notes. */
export function matchesLogin(login: LoginLike, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [login.site, login.url, login.username, login.notes]
    .filter(Boolean).join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}
