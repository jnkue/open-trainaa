-- Fix upload_source column to have proper type and add missing providers
-- Also remove UNIQUE constraint from fit_files.file_hash to allow duplicate uploads
BEGIN;

-- First, add missing providers to fitness_providers table
INSERT INTO fitness_providers (name, display_name, auth_url, token_url, api_base_url, supports_activities, supports_wellness, supports_gps, enabled)
VALUES
    ('wahoo', 'Wahoo', 'https://api.wahooligan.com/oauth/authorize', 'https://api.wahooligan.com/oauth/token', 'https://api.wahooligan.com/v1', true, false, true, true),
    ('fit_file', 'FIT File Upload', '', '', '', true, false, true, true)
ON CONFLICT (name) DO NOTHING;

-- Remove UNIQUE constraint from file_hash to allow duplicate uploads
-- (duplicates are linked via activities.duplicate_of instead)
ALTER TABLE fit_files DROP CONSTRAINT IF EXISTS fit_files_file_hash_key;

-- Fix the upload_source column - it was missing the VARCHAR type
-- First drop the constraint if it exists
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_upload_source_fkey;

-- Alter the column to add proper type
ALTER TABLE activities ALTER COLUMN upload_source TYPE VARCHAR(50);

-- Re-add the foreign key constraint
ALTER TABLE activities ADD CONSTRAINT activities_upload_source_fkey
    FOREIGN KEY (upload_source) REFERENCES fitness_providers(name);

-- Make upload_source NOT NULL with a default for new records
-- We'll set a default based on which source field is populated
-- But first, let's update existing records that don't have upload_source set

-- Update existing records based on their source
UPDATE activities
SET upload_source = 'strava'
WHERE upload_source IS NULL
  AND strava_response_id IS NOT NULL;

UPDATE activities
SET upload_source = 'fit_file'
WHERE upload_source IS NULL
  AND fit_file_id IS NOT NULL;

-- Now we can safely add NOT NULL constraint
ALTER TABLE activities ALTER COLUMN upload_source SET NOT NULL;

COMMIT;
