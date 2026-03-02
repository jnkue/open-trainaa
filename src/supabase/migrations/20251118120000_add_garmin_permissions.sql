-- Add permissions column to garmin_tokens table
-- This will store the permissions array from Garmin API
-- Example: ["ACTIVITY_EXPORT", "WORKOUT_IMPORT", "HEALTH_EXPORT", "COURSE_IMPORT", "MCT_EXPORT"]

ALTER TABLE garmin_tokens
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN garmin_tokens.permissions IS 'Array of Garmin permissions granted by user. Fetched from Garmin Wellness API /user/permissions endpoint. Used to validate upload_workouts_enabled and download_activities_enabled settings.';
