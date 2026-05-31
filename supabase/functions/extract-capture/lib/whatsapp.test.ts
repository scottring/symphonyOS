import { describe, it, expect } from 'vitest'
import { parseWhatsAppExport } from './whatsapp'

describe('parseWhatsAppExport', () => {
  it('parses ISO-style iOS lines', () => {
    const txt = `[2026-05-30, 09:14:23] Mom: Eleanor's party Saturday!\n[2026-05-30, 09:15:01] Dad: What time?`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs).toEqual([
      { timestamp: '2026-05-30T09:14:23', sender: 'Mom', text: "Eleanor's party Saturday!" },
      { timestamp: '2026-05-30T09:15:01', sender: 'Dad', text: 'What time?' },
    ])
  })

  it('parses 12-hour US lines', () => {
    const txt = `[5/30/26, 9:14:23 AM] Mom: hi\n[5/30/26, 1:05:00 PM] Mom: bye`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs[0].timestamp).toBe('2026-05-30T09:14:23')
    expect(msgs[1].timestamp).toBe('2026-05-30T13:05:00')
  })

  it('folds continuation lines into the previous message', () => {
    const txt = `[2026-05-30, 09:14:23] Mom: line one\nline two\n[2026-05-30, 09:15:00] Dad: ok`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs[0].text).toBe('line one\nline two')
    expect(msgs).toHaveLength(2)
  })

  it('keeps media placeholders as text and strips the LTR mark', () => {
    const txt = `[2026-05-30, 09:14:23] Mom: ‎<attached: flyer.jpg>`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs[0].text).toBe('<attached: flyer.jpg>')
  })
})
