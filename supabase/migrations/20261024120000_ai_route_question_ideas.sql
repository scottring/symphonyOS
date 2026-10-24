-- question-ideas (2026-10-24): the lightbulb beside a question Symphony asks in
-- chat. An interactive paid route, so it joins the guarded allowlist. Must
-- match GUARDED_AI_ROUTES in supabase/functions/_shared/aiUsage.ts.

create or replace function public.ai_guarded_routes()
returns text[] language sql immutable as $$
  select array[
    'symphony-agent', 'workspace-voice', 'wall-ask', 'wall-say',
    'analyze-attachment', 'analyze-capture', 'analyze-link', 'extract-capture', 'parse-page', 'plan-from-paper', 'routine-from-doc',
    'goal-planning-chat', 'planning-conversation', 'tend-week', 'sharpen-goal', 'suggest-waiting-for', 'rhythms-parse',
    'kiosk-agent', 'math-story', 'meal-planner-chat', 'meal-slot-suggest', 'semantic-search', 'note-match',
    'question-ideas'
  ]
$$;
