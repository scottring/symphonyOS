// src/components/planning/guided/parseSuggestions.ts
//
// Parse the guide's suggest-moves reply: a JSON array of short strings, with
// a line-split fallback for replies that ignored the format. Pure + testable,
// and kept out of GuideChat.tsx so that file only exports a component
// (react-refresh constraint).

export function parseSuggestions(reply: string): string[] {
  const jsonMatch = reply.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]) as unknown
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((s) => s.trim()).slice(0, 6)
      }
    } catch { /* fall through to line parsing */ }
  }
  return reply.split('\n')
    .map((l) => l.replace(/^[\s•*-]+|^\d+[.)]\s*/g, '').trim())
    .filter((l) => l.length > 2 && l.length < 120 && !l.endsWith(':'))
    .slice(0, 6)
}
