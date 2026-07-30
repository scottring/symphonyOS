-- "Waiting for" gets a sentence, not just a flag.
--
-- tasks.is_waiting / waiting_since already existed, but there was nowhere to
-- record WHAT you're waiting for — which is the actual content ("Guy's response
-- on whether they can make it to pizza Saturday"). Without it the flag is a
-- label you can't act on, and the assistant can't say anything useful about it.
alter table public.tasks
  add column if not exists waiting_for text;
