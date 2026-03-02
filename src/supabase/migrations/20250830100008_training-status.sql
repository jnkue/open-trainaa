-- Training Status Table: Daily metrics for athlete training load monitoring
-- Stores calculated training metrics for each user on each day

CREATE TABLE IF NOT EXISTS training_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Core Training Load Metrics (based on EWMA calculations)
    fitness FLOAT NOT NULL DEFAULT 0, -- CTL: Chronic Training Load (42-day EWMA)
    fatigue FLOAT NOT NULL DEFAULT 0, -- ATL: Acute Training Load (7-day EWMA)
    form FLOAT NOT NULL DEFAULT 0,    -- TSB: Training Stress Balance (fitness - fatigue)
    
    -- Daily Training Volume
    daily_hr_load FLOAT DEFAULT 0,           -- Total heart rate load for the day
    daily_training_time FLOAT DEFAULT 0,     -- Total training time in minutes
    
    -- Moving Averages - Training Volume
    avg_training_time_7d FLOAT DEFAULT 0,    -- 7-day moving average of training time
    avg_training_time_21d FLOAT DEFAULT 0,   -- 21-day moving average of training time
    
    -- Training Consistency & Patterns
    training_streak INTEGER DEFAULT 0,        -- Current consecutive training days
    rest_days_streak INTEGER DEFAULT 0,      -- Current consecutive rest days
    training_days_7d INTEGER DEFAULT 0,      -- Number of training days in last 7 days
    training_days_21d INTEGER DEFAULT 0,     -- Number of training days in last 21 days
    
    -- Recovery & Readiness Indicators
    training_monotony FLOAT DEFAULT 0,       -- Training monotony (avg/std dev of last 7 days)
    training_strain FLOAT DEFAULT 0,         -- Training strain (avg * monotony)
    fitness_trend_7d FLOAT DEFAULT 0,        -- 7-day fitness change rate
    fatigue_trend_7d FLOAT DEFAULT 0,        -- 7-day fatigue change rate
    
    -- Risk Assessment TODO good idea for later
    -- injury_risk_score FLOAT DEFAULT 0,       -- Calculated injury risk (0-100)
    --overtraining_risk FLOAT DEFAULT 0,       -- Overtraining risk indicator

    needs_update BOOLEAN DEFAULT FALSE, -- Flag to indicate if recalculation is needed
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_user_date UNIQUE(user_id, date),
    CONSTRAINT valid_fitness CHECK (fitness >= 0),
    CONSTRAINT valid_fatigue CHECK (fatigue >= 0),
    CONSTRAINT valid_daily_values CHECK (
        daily_hr_load >= 0 AND 
        daily_training_time >= 0
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_status_user_date ON training_status(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_training_status_date ON training_status(date DESC);
CREATE INDEX IF NOT EXISTS idx_training_status_form ON training_status(user_id, form DESC) WHERE form IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_status_fitness ON training_status(user_id, fitness DESC) WHERE fitness > 0;

-- Row Level Security
ALTER TABLE training_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own training status" ON training_status
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert their own training status" ON training_status
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own training status" ON training_status
    FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own training status" ON training_status
    FOR DELETE USING ((SELECT auth.uid()) = user_id);
