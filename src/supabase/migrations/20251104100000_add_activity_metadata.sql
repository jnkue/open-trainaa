-- Add external_id, manufacturer, product, and device_name to activities table
-- This migration adds tracking for external provider IDs and device metadata

-- Add new columns to activities table
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS external_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
ADD COLUMN IF NOT EXISTS product VARCHAR(100),
ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);

-- Create index on external_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_activities_external_id ON activities(external_id);

-- Migrate existing Strava activity IDs to external_id
UPDATE activities
SET external_id = CAST(strava_activity_id AS VARCHAR)
WHERE strava_activity_id IS NOT NULL
AND external_id IS NULL;

-- Add comment to document the columns
COMMENT ON COLUMN activities.external_id IS 'External provider activity ID (e.g., Garmin activity ID, Strava activity ID)';
COMMENT ON COLUMN activities.manufacturer IS 'Device manufacturer from FIT file (e.g., garmin, wahoo_fitness)';
COMMENT ON COLUMN activities.product IS 'Device product ID from FIT file (e.g., 3122 for Garmin devices)';
COMMENT ON COLUMN activities.device_name IS 'Human-readable device name from provider API (e.g., "Garmin Venu 2")';

-- Mark strava_activity_id as deprecated - use external_id instead
COMMENT ON COLUMN activities.strava_activity_id IS 'DEPRECATED: Use external_id instead. Kept for backward compatibility only.';
