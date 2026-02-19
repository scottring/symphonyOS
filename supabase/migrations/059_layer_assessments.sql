-- Layer assessments: per-layer status and onboarding state
-- Tracks which intelligence layers a user has set up and their current state

CREATE TABLE IF NOT EXISTS layer_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  layer_id UUID REFERENCES intelligence_layers(id) NOT NULL,
  status TEXT DEFAULT 'setup',          -- 'setup' | 'active' | 'inactive' | 'paused'
  completed_at TIMESTAMPTZ,             -- when onboarding/setup was completed
  config JSONB DEFAULT '{}',            -- layer-specific config (e.g., assessment answers)
  last_generation_at TIMESTAMPTZ,       -- when AI last generated content for this layer
  generation_count INT DEFAULT 0,       -- how many times AI has generated for this layer
  notes TEXT,                           -- user notes about this layer
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, layer_id)
);

ALTER TABLE layer_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own layer assessments"
  ON layer_assessments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_layer_assessments_user ON layer_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_layer_assessments_layer ON layer_assessments(layer_id);

-- Auto-create a Relish layer assessment for users who have playbook blocks
-- (they've already implicitly set up the Relish layer)
INSERT INTO layer_assessments (user_id, layer_id, status, completed_at)
SELECT DISTINCT pb.user_id, il.id, 'active', now()
FROM playbook_blocks pb
CROSS JOIN intelligence_layers il
WHERE il.slug = 'relish'
ON CONFLICT (user_id, layer_id) DO NOTHING;
