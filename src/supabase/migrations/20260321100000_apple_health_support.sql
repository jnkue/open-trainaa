-- Apple Health integration support
-- 1. Drops the constraint that requires either fit_file_id or strava_response_id,
--    allowing Apple Health activities which have neither.
-- 2. Makes OAuth columns nullable on fitness_providers since Apple Health
--    is an on-device integration with no OAuth flow.
-- 3. Adds apple_health as a fitness provider.

ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_fit_or_strava;

ALTER TABLE fitness_providers ALTER COLUMN auth_url DROP NOT NULL;
ALTER TABLE fitness_providers ALTER COLUMN token_url DROP NOT NULL;
ALTER TABLE fitness_providers ALTER COLUMN api_base_url DROP NOT NULL;

-- 4. Unique constraint for external_id dedup (prevents race conditions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_external_id_dedup
  ON activities (user_id, external_id, upload_source)
  WHERE external_id IS NOT NULL;

INSERT INTO fitness_providers (name, display_name, supports_activities, supports_wellness, supports_gps, enabled)
VALUES ('apple_health', 'Apple Health', true, true, true, true)
ON CONFLICT (name) DO NOTHING;
