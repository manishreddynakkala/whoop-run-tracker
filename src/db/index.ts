import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_PATH || './data/whoop_tracker.db';

// Ensure data directory exists
const dataDir = path.dirname(path.resolve(dbPath));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await open({
    filename: path.resolve(dbPath),
    driver: sqlite3.Database,
  });

  await initSchema(dbInstance);
  return dbInstance;
}

async function initSchema(db: Database) {
  // Enable foreign keys and WAL mode for better concurrency
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec('PRAGMA journal_mode = WAL;');

  // Tokens table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whoop_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL, -- Unix timestamp in ms
      token_type TEXT DEFAULT 'bearer',
      scope TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Workouts table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whoop_workouts (
      id TEXT PRIMARY KEY, -- WHOOP Workout UUID
      user_id TEXT,
      sport_id INTEGER,
      sport_name TEXT,
      is_running INTEGER DEFAULT 0, -- 1 if running activity, 0 otherwise
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

  // Indexes for fast running metrics queries
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
