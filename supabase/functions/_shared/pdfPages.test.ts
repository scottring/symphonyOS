import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { pdfPageCount } from './pdfPages'

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0))
const concat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length } return out }

/** A plain PDF: page objects in the open. */
function plainPdf(pages: number): Uint8Array {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')
  let body = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages} >>\nendobj\n`
  for (let i = 0; i < pages; i++) body += `${i + 3} 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox [0 0 612 792]>>\nendobj\n`
  return bytes(body + 'trailer\n<< /Root 1 0 R >>\n%%EOF\n')
}

/** A PDF 1.5 file whose page objects (and page tree) live in a compressed object stream. */
function packedPdf(pages: number): Uint8Array {
  const inner = [`<< /Type /Pages /Kids [] /Count ${pages} >>`, ...Array.from({ length: pages }, () => '<< /Type /Page /Parent 2 0 R >>')].join('\n')
  const packed = deflateSync(Buffer.from(inner, 'latin1'))
  return concat(
    bytes(`%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n5 0 obj\n<< /Type /ObjStm /N ${pages + 1} /First 10 /Filter /FlateDecode /Length ${packed.length} >>\nstream\r\n`),
    packed,
    bytes('\r\nendstream\nendobj\n%%EOF\n'),
  )
}

describe('pdfPageCount', () => {
  it('counts open page objects, not the page tree', async () => {
    expect(await pdfPageCount(plainPdf(1))).toBe(1)
    expect(await pdfPageCount(plainPdf(12))).toBe(12)
  })
  it('counts pages packed in compressed object streams', async () => {
    expect(await pdfPageCount(packedPdf(7))).toBe(7)
  })
  it('errs high: a larger /Count wins over fewer visible page objects', async () => {
    const text = new TextDecoder('latin1').decode(plainPdf(2)).replace('/Count 2', '/Count 40')
    expect(await pdfPageCount(bytes(text))).toBe(40)
  })
  it('gives up (null) rather than guess low', async () => {
    expect(await pdfPageCount(bytes('not a pdf at all'))).toBeNull()
    // An object stream it cannot inflate.
    const broken = concat(bytes('%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 3 /Filter /FlateDecode >>\nstream\n'), bytes('garbage'), bytes('\nendstream\nendobj\n'))
    expect(await pdfPageCount(broken)).toBeNull()
    // Or one under a filter it does not read.
    const lzw = bytes('%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 3 /Filter /LZWDecode >>\nstream\nxx\nendstream\nendobj\n')
    expect(await pdfPageCount(lzw)).toBeNull()
  })
})
