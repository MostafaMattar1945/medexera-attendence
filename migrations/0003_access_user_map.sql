-- Bind verified Cloudflare Access identities to existing Medexera application users.
CREATE TABLE IF NOT EXISTS access_user_map (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  app_username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
