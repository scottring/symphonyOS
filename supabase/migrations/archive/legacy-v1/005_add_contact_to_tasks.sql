-- Add contact association to tasks
-- Allows linking a task to a contact

alter table tasks
  add column contact_id uuid references contacts(id) on delete set null;

-- Index for finding tasks by contact
create index tasks_contact_id_idx on tasks(contact_id) where contact_id is not null;
