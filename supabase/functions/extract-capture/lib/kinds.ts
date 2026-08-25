// Kinds whose raw_text is a timestamped message transcript in the
// "[YYYY-MM-DD, HH:mm:ss] Sender: text" format parseWhatsAppExport reads.
// These get checkpoint dedupe; everything else is extracted whole.
const TIMESTAMPED = new Set(['whatsapp_export', 'classdojo_thread'])

export function isTimestampedKind(kind: string): boolean {
  return TIMESTAMPED.has(kind)
}
