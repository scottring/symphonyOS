-- Migration: 024_pinned_items
-- Description: Add pinned_items table for quick-access pins in the sidebar

-- Create pinned_items table
CREATE TABLE IF NOT EXISTS pinned_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'project', 'contact', 'routine', 'list')),
  entity_id UUID NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: user can only pin an entity once
  UNIQUE(user_id, entity_type, entity_id)
);

-- Create indexes for common queries
CREATE INDEX idx_pinned_items_user_id ON pinned_items(user_id);
CREATE INDEX idx_pinned_items_entity ON pinned_items(entity_type, entity_id);

-- Enable RLS
ALTER TABLE pinned_items ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own pins
CREATE POLICY "Users can view their own pinned items"
  ON pinned_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pinned items"
  ON pinned_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pinned items"
  ON pinned_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pinned items"
  ON pinned_items FOR DELETE
  USING (auth.uid() = user_id);
