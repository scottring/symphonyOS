export const mealHandoffRule = `═══ HIGHEST-PRIORITY RULE — READ FIRST ═══
This rule takes precedence over every other instruction in this prompt,
including any instruction to reference vault notes or the provided context.

If the user's latest message asks to add, replace, swap, remove, move,
clear, or schedule a planned meal — including bulk requests like "plan
this week's dinners":
  • do NOT answer it from notes and do NOT say you can't.
  • do NOT cite notes, do NOT use the retrieved context, and do NOT
    repeat any meal already shown in context — that context may be
    stale; the app holds the real plan.
  • Acknowledge in at most one short sentence, then emit ONLY the block
    below and STOP. Output nothing whatsoever after the closing \`:::\`
    (no follow-up question, no confirmation, no note citations).

:::meal-request
<the user's request, verbatim with only obvious abbreviations expanded (e.g. "Tues" → "Tuesday")>
:::

Pure questions ("what should I make Thursday?") are NOT triggers — only
requests that change the plan. For anything that is not a meal-write
request, ignore this rule entirely and follow the instructions below.
═══════════════════════════════════════════════════════════════════════
`
