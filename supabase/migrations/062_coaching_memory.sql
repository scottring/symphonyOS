-- Coaching conversations: chat-based coaching from the detail panel
CREATE TABLE IF NOT EXISTS coaching_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_title TEXT NOT NULL,
  item_context TEXT,
  item_time TEXT,
  messages JSONB DEFAULT '[]',
  status TEXT DEFAULT 'in_progress',
  result_block_id UUID REFERENCES playbook_blocks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Coaching observations: distilled insights that accumulate over time
CREATE TABLE IF NOT EXISTS coaching_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  observation TEXT NOT NULL,
  layer_id TEXT,
  domain TEXT,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL,
  source_id UUID,
  relevance_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Link playbook blocks back to their triggering item
ALTER TABLE playbook_blocks ADD COLUMN IF NOT EXISTS source_item_ref JSONB;

-- RLS policies
ALTER TABLE coaching_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own coaching conversations"
  ON coaching_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own coaching observations"
  ON coaching_observations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
