import type { ConnectorMessage } from './types.ts'

// The exact shape parseWhatsAppExport reads:
//   [YYYY-MM-DD, HH:mm:ss] Sender: first line
//   continuation lines, appended to the message above
//
// normalizeTimestamp() splits the bracketed part on a comma and produces a
// NAIVE local ISO string. filterSince() then compares those strings
// lexicographically against the stored checkpoint. So the zone used here is
// load-bearing: render in UTC and every message jumps hours, which either
// replays a batch or drops it.

function formatLocal(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  // Some runtimes render midnight as hour "24"; the parser would read that
  // as an out-of-range hour and shift the message a day.
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}, ${hour}:${get('minute')}:${get('second')}`
}

/** A continuation line starting with "[" would be read as a new message
 * header. One leading space defeats the parser's ^ anchor without changing
 * what a human reads. */
function neutralize(text: string): string {
  return text
    .split('\n')
    .map((line, i) => (i > 0 && line.startsWith('[') ? ` ${line}` : line))
    .join('\n')
}

export function renderTranscript(messages: ConnectorMessage[], timezone: string): string {
  return [...messages]
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((m) => `[${formatLocal(m.timestamp, timezone)}] ${m.sender}: ${neutralize(m.text)}`)
    .join('\n')
}
