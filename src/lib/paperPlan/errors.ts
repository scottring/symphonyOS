// What a person can DO when reading a paper page fails. The functions return a
// stable code; this turns it into a plain sentence. Never shows a parser or
// HTTP message (the 2026-09-23 failure showed "Unexpected token 'I' …").

export type PaperErrorCode =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'image_unavailable' | 'model_busy' | 'model_refused'
  | 'reply_unreadable' | 'too_long' | 'server_config' | 'network' | 'unknown'

const KEPT = 'Your photos and notes are kept.'

export function paperErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'unauthorized':
      return `You’ve been signed out. Sign in again, then try again. ${KEPT}`
    case 'model_busy':
      return `The page reader is busy right now. Try again in a minute. ${KEPT}`
    case 'image_unavailable':
      return `One of the photos couldn’t be opened. Remove it, add it again, and try again.`
    case 'model_refused':
      return `These pages couldn’t be read. Try a clearer, straighter photo, or one page per photo. ${KEPT}`
    case 'too_long':
      return `There’s more on these pages than one reading can hold. Try one page per photo. ${KEPT}`
    case 'network':
      return `Couldn’t reach Symphony. Check your connection and try again. ${KEPT}`
    case 'forbidden':
    case 'bad_request':
      return `Something about these photos couldn’t be sent. Remove them and add them again.`
    case 'reply_unreadable':
    case 'server_config':
    case 'unknown':
    default:
      return `The reading didn’t come back in a usable form. Try again — nothing was saved. ${KEPT}`
  }
}

/** Whether "Try again" can work without the user changing anything. */
export function isRetryable(code: string | null | undefined): boolean {
  return code !== 'forbidden' && code !== 'bad_request' && code !== 'image_unavailable' && code !== 'unauthorized'
}

export class PaperPlanError extends Error {
  readonly code: PaperErrorCode
  constructor(code: PaperErrorCode) {
    super(paperErrorMessage(code))
    this.name = 'PaperPlanError'
    this.code = code
  }
}

const KNOWN = new Set<string>(['bad_request', 'unauthorized', 'forbidden', 'image_unavailable', 'model_busy', 'model_refused', 'reply_unreadable', 'too_long', 'server_config', 'network', 'unknown'])

/** The code from an edge function's JSON error body: `{error:{code}}` (plan-from-paper) or `{error, code}` (parse-page). */
export function codeFromBody(body: unknown, status?: number): PaperErrorCode {
  const b = body as { error?: unknown; code?: unknown } | null
  const nested = b && typeof b.error === 'object' && b.error ? (b.error as { code?: unknown }).code : undefined
  const code = typeof nested === 'string' ? nested : typeof b?.code === 'string' ? b.code : undefined
  if (code && KNOWN.has(code)) return code as PaperErrorCode
  if (status === 401 || /invalid token|unauthorized|jwt/i.test(String(b?.error ?? ''))) return 'unauthorized'
  return 'unknown'
}
