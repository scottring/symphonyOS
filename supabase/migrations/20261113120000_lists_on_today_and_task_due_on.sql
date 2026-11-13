-- Today's facelift (Scott, 2026-11-13).
--
-- lists.show_on_today: the list appears in the quiet "Lists" line at the foot
-- of Today (Groceries 12 · Sundries 4 · Amazon 3) and opens in the card.
-- Default off. It belongs to the list, so a shared list shows for everyone
-- who can see it.
alter table public.lists
  add column if not exists show_on_today boolean not null default false;

comment on column public.lists.show_on_today is
  'Show this list in the Lists line at the foot of Today. Default false.';

-- tasks.due_on: the date a task must be done by ("return by Mon 16"). The
-- task comes into Today's To do from three days before, wearing "by Mon 16".
-- A DATE, written with localYmd like needed_on. Null: no due date.
alter table public.tasks
  add column if not exists due_on date;

comment on column public.tasks.due_on is
  'Done-by date (e.g. an Amazon return window). Shown in Today''s To do from 3 days before. Null = none.';
