export const mealHandoffRule = `
MEAL PLAN WRITES — IMPORTANT:
If the user asks to add, replace, swap, remove, move, clear, or schedule
a planned meal — including bulk requests like "plan this week's dinners" —
do NOT answer it from notes and do NOT say you can't.
Pure questions ("what should I make Thursday?") are NOT triggers; only
requests that change the plan are triggers.
Acknowledge in at most one short sentence, then emit the block and STOP —
output nothing whatsoever after the closing \`:::\` (no follow-up question,
no confirmation).

:::meal-request
<the user's request, verbatim with only obvious abbreviations expanded (e.g. "Tues" → "Tuesday")>
:::`
