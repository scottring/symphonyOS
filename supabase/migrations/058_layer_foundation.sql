-- Intelligence Layer Foundation
-- Adds layer registry, layer_id + visibility on playbook_blocks, visibility on planning_resources

-- Layer registry: each intelligence layer that can inject content into the timeline
CREATE TABLE IF NOT EXISTS intelligence_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Relish as the first layer
INSERT INTO intelligence_layers (slug, name, color, description)
VALUES ('relish', 'Relish', 'amber', 'Household relationship coaching — partner, parent-child, sibling, household-as-unit')
ON CONFLICT (slug) DO NOTHING;

-- Add layer_id and source tracking to playbook_blocks
ALTER TABLE playbook_blocks ADD COLUMN IF NOT EXISTS layer_id UUID REFERENCES intelligence_layers(id);
ALTER TABLE playbook_blocks ADD COLUMN IF NOT EXISTS source_rule_ids UUID[] DEFAULT '{}';

-- Add visibility to playbook_blocks (self = private coaching, family = shared, shared = between named individuals)
ALTER TABLE playbook_blocks ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'self';

-- Add visibility + shared_with to planning_resources
ALTER TABLE planning_resources ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'self';
ALTER TABLE planning_resources ADD COLUMN IF NOT EXISTS shared_with UUID[] DEFAULT '{}';

-- Set existing blocks to belong to Relish layer
UPDATE playbook_blocks
SET layer_id = (SELECT id FROM intelligence_layers WHERE slug = 'relish')
WHERE layer_id IS NULL;

-- Index for layer_id lookups
CREATE INDEX IF NOT EXISTS idx_playbook_blocks_layer ON playbook_blocks(layer_id);
