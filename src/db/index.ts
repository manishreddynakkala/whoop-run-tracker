import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { isSupabaseConfigured } from './supabase.js';

dotenv.config();

let dbInstance: any = null;

export async function getDb(): Promise<any> {
  if (dbInstance) {
    return dbInstance;
  }

  // If running on Vercel or Supabase is configured, avoid sqlite file operations
  if (isSupabaseConfigured()) {
    throw new Error('Supabase is configured as primary database');
  }

  try {
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');

    const dbPath = process.env.DATABASE_PATH || (process.env.VERCEL ? '/tmp/whoop_tracker.db' : './data/whoop_tracker.db');
    const dataDir = path.dirname(path.resolve(dbPath));

    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {}
    }

    dbInstance = await open({
      filename: path.resolve(dbPath),
      driver: sqlite3.Database,
    });

    await initSchema(dbInstance);
    return dbInstance;
  } catch (error: any) {
    console.error('Failed to initialize SQLite:', error.message);
    throw error;
  }
}

async function initSchema(db: any) {
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec('PRAGMA journal_mode = WAL;');
  } catch (e) {}

  // Tokens table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whoop_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      token_type TEXT DEFAULT 'bearer',
      scope TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Workouts table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whoop_workouts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      sport_id INTEGER,
      sport_name TEXT,
      is_running INTEGER DEFAULT 0,
      score_state TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      timezone_offset TEXT,
      duration_ms INTEGER,
      distance_meters REAL,
      distance_miles REAL,
      distance_km REAL,
      kilojoules REAL,
      calories REAL,
      average_heart_rate INTEGER,
      max_heart_rate INTEGER,
      strain REAL,
      zone_zero_ms INTEGER,
      zone_one_ms INTEGER,
      zone_two_ms INTEGER,
      zone_three_ms INTEGER,
      zone_four_ms INTEGER,
      zone_five_ms INTEGER,
      raw_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Indexes
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workouts_sport ON whoop_workouts(sport_id);
    CREATE INDEX IF NOT EXISTS idx_workouts_is_running ON whoop_workouts(is_running);
    CREATE INDEX IF NOT EXISTS idx_workouts_start_time ON whoop_workouts(start_time);
  `);

  // Sync log table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      items_synced INTEGER DEFAULT 0,
      running_synced INTEGER DEFAULT 0,
      next_token TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
