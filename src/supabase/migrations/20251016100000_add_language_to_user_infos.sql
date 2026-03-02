-- Migration: Add language and Strava feedback posting fields to user_infos table
-- Stores user's preferred language for personalized feedback and communication
-- Stores user's preference for posting AI feedback to Strava activities

-- Add language column to user_infos table
ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';

-- Add post_feedback_to_strava column to user_infos table
ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS post_feedback_to_strava BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN public.user_infos.language IS 'User preferred language code (e.g., en, de, es, fr, it)';
COMMENT ON COLUMN public.user_infos.post_feedback_to_strava IS 'Whether to automatically post AI feedback to Strava activity descriptions';
