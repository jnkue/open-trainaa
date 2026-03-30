-- Add custom sports free-text field and AI training strategy
ALTER TABLE public.user_infos ADD COLUMN IF NOT EXISTS custom_sports text;
ALTER TABLE public.user_infos ADD COLUMN IF NOT EXISTS training_strategy text;
