-- Research Workspaces: topic-based collections of research for rule synthesis
CREATE TABLE IF NOT EXISTS research_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,                     -- e.g. "Screen Time", "Bedtime Routine"
  description TEXT,                       -- optional context about what rules this workspace targets
  status TEXT DEFAULT 'active',           -- 'active' | 'synthesized' | 'archived'
  last_synthesized_at TIMESTAMPTZ,        -- when rules were last generated from this workspace
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE research_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own research workspaces"
  ON research_workspaces FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_research_workspaces_user ON research_workspaces(user_id);

-- Add workspace_id to planning_resources (nullable for backward compat)
ALTER TABLE planning_resources ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES research_workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_planning_resources_workspace ON planning_resources(workspace_id);
