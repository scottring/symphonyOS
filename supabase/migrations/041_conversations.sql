-- Conversations table for multi-turn chat with AI
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Conversation metadata
  title text,
  started_at timestamptz DEFAULT now() NOT NULL,
  last_message_at timestamptz DEFAULT now() NOT NULL,

  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Messages within conversations
CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Message content
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,

  -- Actions taken by AI (for audit/undo)
  actions_taken jsonb DEFAULT '[]',
  -- Example: [{"type": "task_created", "entityId": "...", "title": "..."}]

  -- Entity references mentioned in message
  entity_references jsonb DEFAULT '[]',
  -- Example: [{"type": "task", "id": "...", "title": "..."}]

  -- AI metadata (for assistant messages)
  ai_model text,
  ai_latency_ms integer,
  input_tokens integer,
  output_tokens integer,

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for conversations
CREATE INDEX conversations_user_id_idx ON conversations(user_id);
CREATE INDEX conversations_user_status_idx ON conversations(user_id, status);
CREATE INDEX conversations_last_message_idx ON conversations(last_message_at DESC);

-- Indexes for messages
CREATE INDEX conversation_messages_conversation_idx ON conversation_messages(conversation_id);
CREATE INDEX conversation_messages_created_idx ON conversation_messages(conversation_id, created_at);
CREATE INDEX conversation_messages_user_idx ON conversation_messages(user_id);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Users can view own messages"
  ON conversation_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON conversation_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view messages in conversations they own
CREATE POLICY "Users can view messages in their conversations"
  ON conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Trigger to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_message_insert_trigger
  AFTER INSERT ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Trigger to auto-generate conversation title from first user message
CREATE OR REPLACE FUNCTION auto_title_conversation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'user' THEN
    UPDATE conversations
    SET title = COALESCE(title, LEFT(NEW.content, 50))
    WHERE id = NEW.conversation_id AND title IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_auto_title_trigger
  AFTER INSERT ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION auto_title_conversation();
