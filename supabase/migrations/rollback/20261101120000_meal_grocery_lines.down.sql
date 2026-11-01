-- Undo 20261101120000_meal_grocery_lines.sql. The Groceries list keeps its
-- items; only the record of which meals they came from goes.
drop table if exists public.meal_grocery_lines;
