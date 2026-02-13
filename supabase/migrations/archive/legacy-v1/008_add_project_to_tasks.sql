-- Add project_id foreign key to tasks table
-- Allows tasks to be associated with a project

alter table tasks add column project_id uuid references projects(id) on delete set null;

-- Index for efficient project task queries
create index tasks_project_id_idx on tasks(project_id) where project_id is not null;
