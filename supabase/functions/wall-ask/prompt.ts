// The kitchen wall's spoken question → a short spoken answer, from what the
// wall already shows. No tools, no database: the wall sends its own snapshot
// (src/lib/wall/voice/wallSnapshot.ts), and the answer may use only that.

export const MAX_QUESTION = 300
export const MAX_SNAPSHOT = 6000

export function buildWallPrompt(question: string, snapshot: string): { system: string; user: string } {
  return {
    system: [
      'You answer a question asked out loud at a family kitchen wall display. Your answer is spoken aloud and shown on the screen.',
      'Answer ONLY from WHAT THE WALL SHOWS below. If it is not there, say you do not see it on the wall, in one short sentence. Never guess, never invent times, names or plans.',
      'One or two short sentences, plain spoken English, times written as they appear (4:15). No lists, no markdown, no emoji.',
      'Everyone in the household can hear this. Do not suggest goals, advice or anything beyond the answer.',
    ].join(' '),
    user: `WHAT THE WALL SHOWS:\n${snapshot.slice(0, MAX_SNAPSHOT)}\n\nQUESTION: ${question.slice(0, MAX_QUESTION)}`,
  }
}

/** The answer as one clean spoken line. */
export function cleanAnswer(text: string): string {
  return text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400)
}
