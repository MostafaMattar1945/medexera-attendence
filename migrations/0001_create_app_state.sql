-- Medexera Attendance — Initial D1 Database Migration
-- Table for holding the authoritative application state S
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,               -- 'current'
  state_json TEXT NOT NULL,          -- JSON serialized state S
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for historical point-in-time recovery snapshots
CREATE TABLE IF NOT EXISTS state_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_json TEXT NOT NULL,
  saved_by TEXT,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index on snapshot timestamps
CREATE INDEX IF NOT EXISTS idx_snapshots_saved_at ON state_snapshots(saved_at);

