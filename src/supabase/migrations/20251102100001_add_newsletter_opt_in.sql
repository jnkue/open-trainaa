-- Migration: Add newsletter_opt_in field to user_infos table
-- Stores user's preference for receiving newsletters and updates

ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS newsletter_opt_in BOOLEAN DEFAULT false NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_infos.newsletter_opt_in IS 'Whether the user has opted in to receive newsletters and updates';
