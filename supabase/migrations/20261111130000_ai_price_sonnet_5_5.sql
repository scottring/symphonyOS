-- Price row for claude-sonnet-5-5 so the AI allowance guard will let the
-- assistant use it (an unpriced model is refused). $2 / $10 per million
-- tokens (cache reads $0.10, charged by the ledger at its 0.1x rule, which
-- slightly overstates them). Source: the claude-api reference, 2026-11-03.
insert into public.ai_model_prices (model, input_cents_per_million, output_cents_per_million, cents_per_minute, enabled, note)
values ('claude-sonnet-5-5', 200, 1000, null, true, 'from the claude-api model table (cached 2026-11-03); recheck platform.claude.com/docs/en/about-claude/pricing')
on conflict (model) do update set input_cents_per_million = excluded.input_cents_per_million,
  output_cents_per_million = excluded.output_cents_per_million, enabled = true, note = excluded.note;
