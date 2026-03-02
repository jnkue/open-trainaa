-- Migration: Add 'action' role to chat_history table
-- This allows storing action messages (e.g., "Workout created") as separate message records

-- Drop existing constraint
ALTER TABLE public.chat_history
DROP CONSTRAINT IF EXISTS chat_history_role_check;

-- Add new constraint with 'action' role
ALTER TABLE public.chat_history
ADD CONSTRAINT chat_history_role_check
CHECK (role IN ('user', 'assistant', 'system', 'action'));

-- Add comment to document the action role
COMMENT ON COLUMN public.chat_history.role IS 'Message role: user (right side), assistant (left side), action (center), or system';
COMMENT ON COLUMN public.chat_history.content IS 'Message content. For actions, this contains JSON with action details';
