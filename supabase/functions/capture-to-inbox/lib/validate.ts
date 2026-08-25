// Request validation for capture-to-inbox. Lives in lib/ so it is importable
// under vitest — index.ts imports from esm.sh and calls Deno.serve at module
// load, neither of which a Node test runner can do.

export interface CaptureBody {
  user_email: string
  title?: string                  // legacy quick-capture path
  kind?: 'text' | 'whatsapp_export' | 'classdojo_thread'
  text?: string
  source_key?: string
  source_label?: string
}

export type ValidationResult =
  | { ok: true; body: CaptureBody }
  | { ok: false; status: number; error: string }

/** Kinds that carry a body to extract, rather than a bare title. */
export function isExtractKind(kind: string | undefined): boolean {
  return kind === 'text' || kind === 'whatsapp_export' || kind === 'classdojo_thread'
}

export function validateRequest(
  headers: Headers,
  body: Partial<CaptureBody>,
  expectedSecret: string,
): ValidationResult {
  const provided = headers.get('x-capture-secret')
  if (!provided || provided !== expectedSecret) {
    return { ok: false, status: 401, error: 'invalid or missing capture secret' }
  }
  if (!body.user_email || typeof body.user_email !== 'string' || body.user_email.trim() === '') {
    return { ok: false, status: 400, error: 'user_email required' }
  }
  if (isExtractKind(body.kind)) {
    if (!body.text || typeof body.text !== 'string' || body.text.trim() === '') {
      return { ok: false, status: 400, error: 'text required for kind=text|whatsapp_export|classdojo_thread' }
    }
  } else if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return { ok: false, status: 400, error: 'title required' }
  }
  return { ok: true, body: body as CaptureBody }
}
