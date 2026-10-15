# Conversation bench

The executable conversation suite of the reliability plan (§10). Scenarios live in `scenarios/*.json`; the same file drives every layer:

1. **Contract layer** (`npx vitest run scripts/conversation-bench`): no model, no network. For each scenario step it feeds the step's *expected* tool calls through the real server validators (`changeSetFromInput`, `resolveRefs`, `summarizeTurn`) and the real client applier (`applyChangeSet` with an in-memory store), and checks the resulting records, the receipt state and the forbidden changes. This proves the plumbing can only produce the specified outcome; it says nothing about whether the model chooses those calls.
2. **Live text layer** (`node scripts/conversation-bench/live.mjs <scenario> --account <email>`): sends each step's utterance to the deployed `symphony-agent` as a synthetic account and grades the `outcome` event, the tool calls it made, and the database rows afterwards against the scenario. Opt-in; needs `SUPABASE_URL`, `SUPABASE_ANON_KEY` and the synthetic account's password in `BENCH_PASSWORD`. **Never point it at a real household.** Not run on this candidate.
3. **Recorded audio and human sessions**: the same scenarios, spoken (see the plan); no automation here yet.

Scenario fields:

- `id`, `title`, `surface` (`desktop` | `wall`), `start`: the synthetic records before the first step (tasks, routines, events, members).
- `steps[]`: `say` (what the person types or says), `expect.outcome` (the allowed `outcome.state`s), `expect.tools` (the tool calls the contract layer replays; for the live layer, the calls the model must make, by name), `expect.records` (what must be true afterwards: created titles and dates, moved ids, untouched ids), `forbid` (tool names and record changes that fail the step), `say_must` / `say_must_not` (regexes over the spoken reply, live layer only).

Grading is on records and the structured outcome, not on whether the transcript sounds right.
