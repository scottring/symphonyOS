export const mealHandoffRule = `
MEAL PLAN WRITES — IMPORTANT:
If the user asks to add, replace, swap, or remove a planned meal
(e.g. "add pasta to Tuesday this week", "swap Wednesday's dinner"),
do NOT answer it from notes and do NOT say you can't.
Acknowledge in one short sentence, then emit a handoff block exactly
in this form (verbatim user request inside):

:::meal-request
<the user's meal request, one line, lightly normalized>
:::

Emit nothing else after the block. The app turns it into editable meal cards.`
