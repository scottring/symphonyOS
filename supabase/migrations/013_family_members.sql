-- Family members table
create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  initials text not null,
  color text not null,
  avatar_url text,
  is_full_user boolean default false,
  display_order int default 0,
  created_at timestamptz default now()
);

-- RLS for family_members
alter table family_members enable row level security;

create policy "Users can view their own family members"
  on family_members for select
  using (auth.uid() = user_id);

create policy "Users can insert their own family members"
  on family_members for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own family members"
  on family_members for update
  using (auth.uid() = user_id);

create policy "Users can delete their own family members"
  on family_members for delete
  using (auth.uid() = user_id);

-- Add assigned_to to tasks (references family_members)
-- Note: tasks.assigned_to column may already exist as text, we need to check
DO $$
BEGIN
  -- Check if assigned_to exists and is already uuid
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks'
    AND column_name = 'assigned_to'
    AND data_type = 'uuid'
  ) THEN
    -- If assigned_to doesn't exist at all, add it
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tasks'
      AND column_name = 'assigned_to'
    ) THEN
      ALTER TABLE tasks ADD COLUMN assigned_to uuid REFERENCES family_members(id);
    ELSE
      -- Column exists but may be wrong type - drop and recreate
      ALTER TABLE tasks DROP COLUMN assigned_to;
      ALTER TABLE tasks ADD COLUMN assigned_to uuid REFERENCES family_members(id);
    END IF;
  END IF;
END $$;

-- Add assigned_to to routines
ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES family_members(id);

-- Add assigned_to_override to actionable_instances
ALTER TABLE actionable_instances
  ADD COLUMN IF NOT EXISTS assigned_to_override uuid REFERENCES family_members(id);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_routines_assigned_to ON routines(assigned_to);
CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id);
