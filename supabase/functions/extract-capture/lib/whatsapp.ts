export interface ParsedMessage {
  timestamp: string // ISO-ish local: YYYY-MM-DDTHH:mm:ss
  sender: string
  text: string
}

// Matches the bracketed prefix WhatsApp puts on the first line of each message.
// Group 1 = datetime substring, Group 2 = sender, Group 3 = first line of text.
const HEAD = /^‎?\[([^\]]+)\]\s([^:]+):\s?‎?(.*)$/

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// Accepts "2026-05-30, 09:14:23" and "5/30/26, 9:14:23 AM" -> "YYYY-MM-DDTHH:mm:ss".
export function normalizeTimestamp(raw: string): string {
  const [datePart, timePartRaw] = raw.split(',').map((s) => s.trim())
  let h: number, m: number, s: number
  const ampm = /\b(AM|PM)\b/i.exec(timePartRaw)
  const [hh, mm, ss] = timePartRaw.replace(/\s*(AM|PM)\s*/i, '').split(':')
  h = parseInt(hh, 10); m = parseInt(mm, 10); s = parseInt(ss ?? '0', 10)
  if (ampm) {
    const isPM = ampm[1].toUpperCase() === 'PM'
    if (isPM && h !== 12) h += 12
    if (!isPM && h === 12) h = 0
  }
  let y: number, mo: number, d: number
  if (datePart.includes('-')) {
    const [yy, mm2, dd] = datePart.split('-').map((x) => parseInt(x, 10))
    y = yy; mo = mm2; d = dd
  } else {
    const [mm2, dd, yy] = datePart.split('/').map((x) => parseInt(x, 10))
    mo = mm2; d = dd; y = yy < 100 ? 2000 + yy : yy
  }
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(m)}:${pad(s)}`
}

export function parseWhatsAppExport(text: string): ParsedMessage[] {
  const out: ParsedMessage[] = []
  for (const line of text.split('\n')) {
    const head = HEAD.exec(line)
    if (head) {
      out.push({
        timestamp: normalizeTimestamp(head[1]),
        sender: head[2].trim(),
        text: head[3].replace(/‎/g, ''),
      })
    } else if (out.length > 0) {
      out[out.length - 1].text += `\n${line.replace(/‎/g, '')}`
    }
  }
  return out
}
