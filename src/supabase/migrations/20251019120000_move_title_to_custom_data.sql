BEGIN;

------------------------------------------------------------------------------------------------------
-- Move title from sessions to session_custom_data
------------------------------------------------------------------------------------------------------
-- This migration moves the title column from sessions to session_custom_data table.
-- Multiple sessions (duplicates) can now share the same title via session_custom_data.
-- Strava title updates will affect all duplicate sessions automatically.

-- Step 1: Add title column to session_custom_data
ALTER TABLE session_custom_data ADD COLUMN IF NOT EXISTS title VARCHAR(300);

-- Step 2: Migrate existing titles from sessions to session_custom_data
-- For each session that has a session_custom_data_id, copy its title to the custom_data record
-- Note: This will update custom_data records multiple times if multiple sessions share the same custom_data_id
-- The last session processed will win, but for duplicates they should have the same title anyway
UPDATE session_custom_data scd
SET title = s.title
FROM sessions s
WHERE s.session_custom_data_id = scd.id
  AND s.title IS NOT NULL
  AND (scd.title IS NULL OR scd.title = '');

-- Step 3: For sessions without custom_data_id, we'll let post-processing handle title creation
-- when it creates the custom_data record

-- Step 4: Add index for title searches (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_session_custom_data_title ON session_custom_data(title);

-- Step 5: Drop title column from sessions table
-- Note: This is a breaking change - ensure all code is updated first
ALTER TABLE sessions DROP COLUMN IF EXISTS title;

COMMIT;
