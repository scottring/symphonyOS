-- Coached Daily Playbook tables
-- Adds playbook blocks, instances, weekly templates, family rules, and responsibilities

-- Weekly templates: groups playbook blocks for a given week
CREATE TABLE IF NOT EXISTS weekly_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  week_of DATE NOT NULL,
  focus_areas TEXT[] DEFAULT '{}',
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE weekly_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own templates"
  ON weekly_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Playbook blocks: coached time blocks for the parent's day
CREATE TABLE IF NOT EXISTS playbook_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  template_id UUID REFERENCES weekly_templates ON DELETE SET NULL,
  time_slot TEXT NOT NULL,
  label TEXT NOT NULL,
  block_type TEXT NOT NULL,
  narrative TEXT NOT NULL,
  coaching_note TEXT,
  items JSONB DEFAULT '[]',
  day_types TEXT[] DEFAULT '{school-day}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE playbook_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own blocks"
  ON playbook_blocks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Playbook instances: daily instance of a block + user feedback
CREATE TABLE IF NOT EXISTS playbook_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  block_id UUID REFERENCES playbook_blocks ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT false,
  react TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  items_state JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(block_id, date)
);

ALTER TABLE playbook_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own instances"
  ON playbook_instances FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Family rules: coaching guidance for ad hoc moments
CREATE TABLE IF NOT EXISTS family_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  rule TEXT NOT NULL,
  applies_to TEXT[] DEFAULT '{everyone}',
  status TEXT DEFAULT 'active',
  rationale TEXT,
  enforcement_tip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE family_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own rules"
  ON family_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Responsibilities: per-kid tasks linked to rules
CREATE TABLE IF NOT EXISTS responsibilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  who TEXT NOT NULL,
  task TEXT NOT NULL,
  frequency TEXT DEFAULT 'daily',
  status TEXT DEFAULT 'active',
  rule_id UUID REFERENCES family_rules ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE responsibilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own responsibilities"
  ON responsibilities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_playbook_blocks_user ON playbook_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_playbook_blocks_day_types ON playbook_blocks USING GIN(day_types);
CREATE INDEX IF NOT EXISTS idx_playbook_instances_user_date ON playbook_instances(user_id, date);
CREATE INDEX IF NOT EXISTS idx_playbook_instances_block ON playbook_instances(block_id);
CREATE INDEX IF NOT EXISTS idx_family_rules_user_status ON family_rules(user_id, status);
CREATE INDEX IF NOT EXISTS idx_responsibilities_user ON responsibilities(user_id);
CREATE INDEX IF NOT EXISTS idx_responsibilities_rule ON responsibilities(rule_id);
