-- Migration: Create threads table for chat thread management
-- Stores thread metadata separate from LangGraph checkpoints for better querying and UX

CREATE TABLE IF NOT EXISTS public.threads (
    thread_id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trainer VARCHAR(50) NOT NULL DEFAULT 'Simon',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON public.threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON public.threads(created_at);
CREATE INDEX IF NOT EXISTS idx_threads_user_created ON public.threads(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own threads" ON public.threads
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert their own threads" ON public.threads
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own threads" ON public.threads
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete their own threads" ON public.threads
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_threads_updated_at ON public.threads;
CREATE TRIGGER trg_threads_updated_at
    BEFORE UPDATE ON public.threads
    FOR EACH ROW EXECUTE FUNCTION public.update_threads_updated_at();

-- Optional: Add a function to clean up orphaned threads (threads without any checkpoints)
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_threads()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete threads that have no corresponding checkpoints and are older than 1 day
    DELETE FROM public.threads
    WHERE created_at < NOW() - INTERVAL '1 day'
    AND NOT EXISTS (
        SELECT 1 FROM checkpoints
        WHERE checkpoints.thread_id = threads.thread_id
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- You can call this function periodically to clean up orphaned threads:
-- SELECT public.cleanup_orphaned_threads();