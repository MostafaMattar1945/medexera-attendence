-- Track which authoritative state version each recovery snapshot represents.
ALTER TABLE state_snapshots ADD COLUMN state_version INTEGER;
CREATE INDEX IF NOT EXISTS idx_snapshots_state_version ON state_snapshots(state_version);
