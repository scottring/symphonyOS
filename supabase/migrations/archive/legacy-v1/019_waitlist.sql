-- Waitlist for early access signups
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'landing_page',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'converted'))
);

-- Enable RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for the public landing page)
CREATE POLICY "Allow anonymous waitlist signups"
  ON waitlist
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Only authenticated users (you) can read/update
CREATE POLICY "Authenticated users can view waitlist"
  ON waitlist
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update waitlist"
  ON waitlist
  FOR UPDATE
  TO authenticated
  USING (true);

-- Index for faster lookups
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_status ON waitlist(status);
