-- Add rich context fields to projects table
-- Makes projects proper context containers with links, phone numbers, and attachments

-- Add links column (jsonb array of {url: string, title?: string} objects)
ALTER TABLE projects ADD COLUMN links jsonb;

-- Add phone_number column for primary contact/vendor
ALTER TABLE projects ADD COLUMN phone_number text;

-- Create index for projects with links
CREATE INDEX projects_with_links_idx ON projects(user_id) WHERE links IS NOT NULL;

-- Create index for projects with phone numbers
CREATE INDEX projects_with_phone_idx ON projects(user_id) WHERE phone_number IS NOT NULL;
