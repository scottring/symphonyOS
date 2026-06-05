// Tolerant of real LLM fence formatting: the body may sit on the same line
// as the opening marker and the closing ::: may have no preceding newline.
// Lazy body + surrounding \s* handles all observed variants. Trade-off: a
// literal ::: inside the request truncates the body — acceptable because the
// handoff prompt normalizes the request and real requests never contain ":::".
const MEAL_REQUEST_RE = /:::meal-request\s*([\s\S]*?)\s*:::/

/** Parse :::meal-request fenced blocks from AI response */
export function parseMealRequest(text: string): { content: string; mealRequest: string | undefined } {
  const match = text.match(MEAL_REQUEST_RE)
  const body = match?.[1]?.trim()
  if (!body) return { content: text, mealRequest: undefined }
  const cleanContent = text.replace(MEAL_REQUEST_RE, '').trim()
  return { content: cleanContent, mealRequest: body }
}
