-- 2026-07-19_meal_prefs_couple_scope.sql
-- Share the "Household Meal Preferences" master prompt with the household's
-- partner: notes already have household RLS for scope IN ('couple','compound');
-- this note defaults to 'individual'. Bump it to 'couple' so both adults read
-- and edit the one canonical prompt. Idempotent.
update notes set scope = 'couple'
where title = 'Household Meal Preferences' and scope = 'individual';
