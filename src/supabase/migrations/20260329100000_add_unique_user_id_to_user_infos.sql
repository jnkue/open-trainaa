-- Add unique constraint on user_id to enable upsert operations
-- user_infos should have exactly one row per user
ALTER TABLE public.user_infos
  ADD CONSTRAINT user_infos_user_id_unique UNIQUE (user_id);
