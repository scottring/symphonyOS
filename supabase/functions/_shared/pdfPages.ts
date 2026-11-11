// How many pages a PDF holds, read from its own page objects, so the spend
// guard (aiBudget.ts) can hold a bounded amount for it. Never the words: only
// the page dictionaries are looked for.
//
// Counts err high, never low: every `/Type /Page` object counts (an edited
// file's replaced pages included), and the largest `/Count` beside them wins
// when it is larger. Page objects packed into compressed object streams are
// inflated and counted too. When a stream cannot be read (an unknown filter,
// encryption, damage) the answer is null and the caller holds the most pages
// the provider accepts instead.

/** The most decompressed bytes read from one PDF before giving up. */
const MAX_INFLATED_BYTES = 64 * 1024 * 1024

function countIn(text: string): { pages: number; count: number } {
  const pages = text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0
  let count = 0
  for (const m of text.matchAll(/\/Count\s+(\d{1,7})/g)) count = Math.max(count, Number(m[1]))
  return { pages, count }
}

async function inflate(data: Uint8Array, budget: { left: number }): Promise<Uint8Array | null> {
  try {
    // A copy on its own ArrayBuffer (a subarray view would type as ArrayBufferLike).
    const chunk = new Uint8Array(data)
    const input = new ReadableStream<BufferSource>({ start(c) { c.enqueue(chunk); c.close() } })
    const reader = input.pipeThrough(new DecompressionStream('deflate')).getReader()
    const parts: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > budget.left) { await reader.cancel().catch(() => {}); return null }
      parts.push(value)
    }
    budget.left -= size
    const out = new Uint8Array(size)
    let at = 0
    for (const p of parts) { out.set(p, at); at += p.length }
    return out
  } catch {
    return null
  }
}

/** Pages in the PDF, or null when they cannot be counted with confidence. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  // windows-1252 maps every byte to one UTF-16 unit, so string offsets are
  // byte offsets.
  const raw = new TextDecoder('latin1').decode(bytes)
  const start = raw.indexOf('%PDF-')
  if (start < 0 || start > 1024) return null
  let { pages, count } = countIn(raw)
  const budget = { left: MAX_INFLATED_BYTES }
  for (const m of raw.matchAll(/\/Type\s*\/ObjStm(?![A-Za-z])/g)) {
    const objStart = raw.lastIndexOf(' obj', m.index)
    const streamAt = raw.indexOf('stream', m.index)
    if (objStart < 0 || streamAt < 0) return null
    const dict = raw.slice(objStart, streamAt)
    // Only a plain Flate stream is read; anything else cannot be counted.
    const filters = dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/)?.[1] ?? ''
    if (filters.replace(/[[\]\s]/g, '') !== '/FlateDecode' || /\/DecodeParms/.test(dict) || /\/Encrypt\b/.test(raw)) return null
    let dataStart = streamAt + 'stream'.length
    if (raw[dataStart] === '\r') dataStart++
    if (raw[dataStart] === '\n') dataStart++
    let dataEnd = raw.indexOf('endstream', dataStart)
    if (dataEnd < 0) return null
    while (dataEnd > dataStart && (raw[dataEnd - 1] === '\n' || raw[dataEnd - 1] === '\r')) dataEnd--
    const inflated = await inflate(bytes.subarray(dataStart, dataEnd), budget)
    if (!inflated) return null
    const inner = countIn(new TextDecoder('latin1').decode(inflated))
    pages += inner.pages
    count = Math.max(count, inner.count)
  }
  const total = Math.max(pages, count)
  return total > 0 ? total : null
}
