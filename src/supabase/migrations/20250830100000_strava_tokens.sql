-- Erstelle eine Tabelle für Strava-Token
CREATE TABLE IF NOT EXISTS strava_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    athlete_id BIGINT NOT NULL,
    scope TEXT NOT NULL,
    athlete_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Ein Benutzer kann nur einen Strava-Account haben
    UNIQUE(user_id),
    UNIQUE(athlete_id)
);

-- Index für bessere Performance
CREATE INDEX IF NOT EXISTS idx_strava_tokens_user_id ON strava_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_strava_tokens_athlete_id ON strava_tokens(athlete_id);

-- RLS (Row Level Security) aktivieren
ALTER TABLE strava_tokens ENABLE ROW LEVEL SECURITY;

-- RLS-Richtlinien erstellen
CREATE POLICY "Benutzer können nur ihre eigenen Strava-Token sehen"
    ON strava_tokens FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Benutzer können nur ihre eigenen Strava-Token erstellen"
    ON strava_tokens FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Benutzer können nur ihre eigenen Strava-Token aktualisieren"
    ON strava_tokens FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Benutzer können nur ihre eigenen Strava-Token löschen"
    ON strava_tokens FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_strava_tokens_updated_at
    BEFORE UPDATE ON strava_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
