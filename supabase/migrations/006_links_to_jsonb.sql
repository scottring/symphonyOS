-- Migrate links column from text[] to jsonb to support TaskLink objects with url and title
-- This preserves existing string links by converting them to {url: string} objects

-- Step 1: Add a new jsonb column
alter table tasks add column links_new jsonb;

-- Step 2: Migrate existing data - convert text[] to jsonb array of objects
update tasks
set links_new = (
  select jsonb_agg(jsonb_build_object('url', link))
  from unnest(links) as link
)
where links is not null and array_length(links, 1) > 0;

-- Step 3: Drop the old column
alter table tasks drop column links;

-- Step 4: Rename new column to links
alter table tasks rename column links_new to links;
