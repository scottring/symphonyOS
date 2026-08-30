// Pure digest logic — prompt, response parsing, and rendering. Deno-free so
// vitest can run it (the extract-capture/lib layout).

export interface DigestSource {
  label: string
  /** Transcript in the connectors' render format: `[date, time] Sender: text`. */
  text: string
}

export interface DigestItem {
  title: string
  /** Free text — "Fri Sep 4", "Tomorrow 7:40am", "by Monday". */
  when?: string
  details?: string
}

export interface DigestSection {
  source: string
  /** Things a parent has to DO — sign, send, bring, RSVP, show up. */
  toDo: DigestItem[]
  /** Things a parent has to KNOW — policy, procedure, schedule changes. */
  goodToKnow: string[]
  /** One sentence for everything else. */
  chatter: string
}

export interface Digest {
  sections: DigestSection[]
}

export function buildDigestPrompt(sources: DigestSource[], dateLabel: string): string {
  const body = sources
    .map((s) => `=== ${s.label} ===\n${s.text}`)
    .join('\n\n')
  return `You write a short daily digest of school and parent-group messages for a busy parent. Today is ${dateLabel}.

MESSAGES, grouped by source:

${body}

For EACH source, produce:
- "toDo": items a parent must act on — forms to sign, things to send in or bring, RSVPs, events to attend, money due. Give a short title, a "when" (the date or deadline, in plain words relative to today where helpful, e.g. "Fri Sep 4", "by tomorrow"), and one line of details (who it is for, where, cost, who asked). Omit "when"/"details" if unknown.
- "goodToKnow": things a parent must KNOW but cannot act on — attendance rules, dismissal procedure, dress code, curriculum or schedule notes. One short sentence each. Never repeat a toDo here.
- "chatter": a single sentence covering what is left (greetings, photos, thanks). Use "Nothing else." if there is nothing.

Keep it tight. Do not invent dates. Respond with strict JSON only, no prose, no markdown fence:
{"sections":[{"source":"<label exactly as given>","toDo":[{"title":"...","when":"...|omit","details":"...|omit"}],"goodToKnow":["..."],"chatter":"..."}]}`
}

const EMPTY: Digest = { sections: [] }

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function parseDigestResponse(raw: string): Digest {
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first === -1 || last <= first) return EMPTY
    try {
      parsed = JSON.parse(trimmed.slice(first, last + 1))
    } catch {
      return EMPTY
    }
  }
  if (!parsed || typeof parsed !== 'object') return EMPTY
  const sections = (parsed as { sections?: unknown }).sections
  if (!Array.isArray(sections)) return EMPTY
  return {
    sections: sections.flatMap((s): DigestSection[] => {
      if (!s || typeof s !== 'object') return []
      const o = s as Record<string, unknown>
      const source = str(o.source)
      if (!source) return []
      const toDo = Array.isArray(o.toDo)
        ? o.toDo.flatMap((i): DigestItem[] => {
            if (!i || typeof i !== 'object') return []
            const it = i as Record<string, unknown>
            const title = str(it.title)
            return title ? [{ title, when: str(it.when), details: str(it.details) }] : []
          })
        : []
      const goodToKnow = Array.isArray(o.goodToKnow)
        ? o.goodToKnow.flatMap((g) => (str(g) ? [str(g)!] : []))
        : []
      return [{ source, toDo, goodToKnow, chatter: str(o.chatter) ?? '' }]
    }),
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The email body. Inline styles only — it is read in Gmail. Warm and plain:
 * a list you can scan in the school pickup line. */
export function renderDigestHtml(digest: Digest, dateLabel: string): string {
  const font = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
  const sections = digest.sections.map((s) => {
    const todo = s.toDo.length
      ? `<ul style="padding-left: 18px; margin: 6px 0 14px;">${s.toDo.map((i) =>
          `<li style="margin: 0 0 8px;"><strong>${esc(i.title)}</strong>${i.when ? ` <span style="color: #2d5a27;">— ${esc(i.when)}</span>` : ''}${i.details ? `<br><span style="color: #555; font-size: 14px;">${esc(i.details)}</span>` : ''}</li>`,
        ).join('')}</ul>`
      : `<p style="color: #777; margin: 4px 0 14px;">Nothing to do.</p>`
    const know = s.goodToKnow.length
      ? `<p style="margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #777;">Good to know</p>
         <ul style="padding-left: 18px; margin: 0 0 14px; color: #333;">${s.goodToKnow.map((g) => `<li style="margin: 0 0 4px;">${esc(g)}</li>`).join('')}</ul>`
      : ''
    const chatter = s.chatter ? `<p style="color: #777; font-size: 13px; margin: 0;">${esc(s.chatter)}</p>` : ''
    return `<div style="background: #f8f7f4; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px; color: #2d5a27;">${esc(s.source)}</h3>
      ${todo}${know}${chatter}
    </div>`
  }).join('')
  return `<div style="${font} max-width: 600px; margin: 0 auto; padding: 20px; color: #222;">
    <h2 style="margin: 0 0 4px;">School digest</h2>
    <p style="margin: 0 0 20px; color: #777;">${esc(dateLabel)}</p>
    ${sections || '<p style="color: #777;">Nothing new today.</p>'}
  </div>`
}

/** Plain-text twin, for the text/plain part. */
export function renderDigestText(digest: Digest, dateLabel: string): string {
  const out: string[] = [`School digest — ${dateLabel}`, '']
  for (const s of digest.sections) {
    out.push(s.source.toUpperCase())
    if (s.toDo.length) {
      for (const i of s.toDo) {
        out.push(`- ${i.title}${i.when ? ` — ${i.when}` : ''}`)
        if (i.details) out.push(`  ${i.details}`)
      }
    } else out.push('Nothing to do.')
    if (s.goodToKnow.length) {
      out.push('Good to know:')
      for (const g of s.goodToKnow) out.push(`- ${g}`)
    }
    if (s.chatter) out.push(s.chatter)
    out.push('')
  }
  if (digest.sections.length === 0) out.push('Nothing new today.')
  return out.join('\n')
}

/** "Fri, Aug 28" in the household's zone. */
export function digestDateLabel(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(now)
}
