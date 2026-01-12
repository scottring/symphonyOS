-- Cleanup duplicate "Scratch Pad" notes
-- This keeps only the most recent Scratch Pad note for each date
-- Run this in your Supabase SQL Editor

-- First, let's see what we have (read-only query)
SELECT
  id,
  title,
  DATE(created_at) as date,
  created_at,
  LENGTH(content) as content_length,
  LEFT(content, 50) as content_preview
FROM notes
WHERE title = 'Scratch Pad'
  AND type = 'quick_capture'
ORDER BY created_at DESC;

-- To see the count by date:
-- SELECT
--   DATE(created_at) as date,
--   COUNT(*) as count
-- FROM notes
-- WHERE title = 'Scratch Pad'
--   AND type = 'quick_capture'
-- GROUP BY DATE(created_at)
-- HAVING COUNT(*) > 1
-- ORDER BY date DESC;

-- Uncomment and run this to DELETE duplicates (keeps most recent per day):
-- WITH ranked_notes AS (
--   SELECT
--     id,
--     ROW_NUMBER() OVER (
--       PARTITION BY user_id, DATE(created_at)
--       ORDER BY created_at DESC
--     ) as rn
--   FROM notes
--   WHERE title = 'Scratch Pad'
--     AND type = 'quick_capture'
-- )
-- DELETE FROM notes
-- WHERE id IN (
--   SELECT id FROM ranked_notes WHERE rn > 1
-- );
