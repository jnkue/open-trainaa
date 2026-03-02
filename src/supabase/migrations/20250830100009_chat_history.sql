-- Migration: Create chat_history table
-- Stores conversation history for the Enhanced Training Agent

CREATE TABLE IF NOT EXISTS public.chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id VARCHAR(255) NOT NULL, -- Thread ID for conversation grouping
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    query_type VARCHAR(50), -- Optional: type of query for categorization
    agent_type VARCHAR(50), -- Which agent handled this interaction
    metadata JSONB DEFAULT '{}', -- Additional context or metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON public.chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_thread_id ON public.chat_history(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON public.chat_history(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_thread ON public.chat_history(user_id, thread_id);

-- Enable Row Level Security
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own chat history" ON public.chat_history
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert their own chat history" ON public.chat_history
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own chat history" ON public.chat_history
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete their own chat history" ON public.chat_history
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_chat_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_history_updated_at ON public.chat_history;
CREATE TRIGGER trg_chat_history_updated_at
    BEFORE UPDATE ON public.chat_history
    FOR EACH ROW EXECUTE FUNCTION public.update_chat_history_updated_at();

-- Optional: Add a function to clean up old chat history (older than 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_history()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.chat_history 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- You can call this function periodically to clean up old data:
-- SELECT public.cleanup_old_chat_history();