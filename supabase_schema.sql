-- Supabase Schema for WHOOP Run Tracker

-- 1. Tokens Table
CREATE TABLE IF NOT EXISTS whoop_tokens (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  token_type TEXT DEFAULT 'bearer',
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Workouts Table
CREATE TABLE IF NOT EXISTS whoop_workouts (
  id TEXT PRIMARY KEY, -- WHOOP Workout UUID
  user_id TEXT,
  sport_id INTEGER,
  sport_name TEXT,
  is_running BOOLEAN DEFAULT FALSE,
  score_state TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  timezone_offset TEXT,
  duration_ms BIGINT,
  distance_meters DOUBLE PRECISION,
  distance_miles DOUBLE PRECISION,
  distance_km DOUBLE PRECISION,
  kilojoules DOUBLE PRECISION,
  calories DOUBLE PRECISION,
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  strain DOUBLE PRECISION,
  zone_zero_ms BIGINT,
  zone_one_ms BIGINT,
  zone_two_ms BIGINT,
  zone_three_ms BIGINT,
  zone_four_ms BIGINT,
  zone_five_ms BIGINT,
  raw_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whoop_workouts_sport ON whoop_workouts(sport_id);
CREATE INDEX IF NOT EXISTS idx_whoop_workouts_is_running ON whoop_workouts(is_running);
CREATE INDEX IF NOT EXISTS idx_whoop_workouts_start_time ON whoop_workouts(start_time DESC);

-- 3. Sync Logs Table
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  items_synced INTEGER DEFAULT 0,
  running_synced INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turn on Row Level Security (RLS) or public access policies
ALTER TABLE whoop_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE whoop_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow anon service role full access policies
CREATE POLICY "Allow anon access to whoop_tokens" ON whoop_tokens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access to whoop_workouts" ON whoop_workouts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access to sync_logs" ON sync_logs FOR ALL USING (true) WITH CHECK (true);
