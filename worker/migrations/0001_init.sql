PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('casegraph','cursor')),
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Community',
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_submissions_client_created ON submissions(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON submissions(status, created_at ASC);

CREATE TABLE IF NOT EXISTS configs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('casegraph','cursor')),
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Community',
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status = 'approved'),
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);
CREATE INDEX IF NOT EXISTS idx_configs_status_created ON configs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS votes (
  config_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (config_id, client_id),
  FOREIGN KEY (config_id) REFERENCES configs(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS config_stats (
  config_id TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (config_id) REFERENCES configs(id) ON DELETE CASCADE
);
