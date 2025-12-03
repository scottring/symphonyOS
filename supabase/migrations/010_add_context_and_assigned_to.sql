-- Add context column to tasks table (replaces domain)
-- Context represents the life area: work, family, personal

ALTER TABLE tasks
ADD COLUMN context TEXT CHECK (context IN ('work', 'family', 'personal'));

-- Add assigned_to column (who should DO this task, separate from contact_id which is who task is ABOUT)
ALTER TABLE tasks
ADD COLUMN assigned_to UUID REFERENCES contacts(id);

-- Index for efficient context-based queries
CREATE INDEX tasks_context_idx ON tasks(context) WHERE context IS NOT NULL;

-- Index for assigned_to queries
CREATE INDEX tasks_assigned_to_idx ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;
