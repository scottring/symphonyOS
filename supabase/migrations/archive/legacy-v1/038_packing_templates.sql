-- Migration: Add packing_templates table for custom packing list templates
-- Allows users to create, edit, and save custom packing templates

-- Create packing_templates table
CREATE TABLE IF NOT EXISTS packing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on user_id for efficient querying
CREATE INDEX IF NOT EXISTS idx_packing_templates_user_id ON packing_templates(user_id);

-- Add index on is_default for filtering default templates
CREATE INDEX IF NOT EXISTS idx_packing_templates_is_default ON packing_templates(is_default);

-- Add GIN index on items for searching within JSONB
CREATE INDEX IF NOT EXISTS idx_packing_templates_items ON packing_templates USING GIN (items);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_packing_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER packing_templates_updated_at
  BEFORE UPDATE ON packing_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_packing_templates_updated_at();

-- Add RLS policies
ALTER TABLE packing_templates ENABLE ROW LEVEL SECURITY;

-- Users can view their own templates and default templates
CREATE POLICY "Users can view own and default templates"
  ON packing_templates FOR SELECT
  USING (user_id = auth.uid() OR is_default = TRUE);

-- Users can insert their own templates
CREATE POLICY "Users can insert own templates"
  ON packing_templates FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own templates (not defaults)
CREATE POLICY "Users can update own templates"
  ON packing_templates FOR UPDATE
  USING (user_id = auth.uid() AND is_default = FALSE)
  WITH CHECK (user_id = auth.uid() AND is_default = FALSE);

-- Users can delete their own templates (not defaults)
CREATE POLICY "Users can delete own templates"
  ON packing_templates FOR DELETE
  USING (user_id = auth.uid() AND is_default = FALSE);

-- Add comment explaining the items structure
COMMENT ON COLUMN packing_templates.items IS 'JSONB array containing packing items: [{name: string, category: string, quantity?: number, essential: boolean}]';

-- Seed default templates from code
-- These will be inserted with a system user and marked as is_default=true
-- (Can be done via a separate script or admin interface)
