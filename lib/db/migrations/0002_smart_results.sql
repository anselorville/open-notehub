CREATE TABLE IF NOT EXISTS smart_results (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL,
  version      INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running',
  result       TEXT,
  meta         TEXT,
  error        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  UNIQUE(document_id, mode, version)
);
CREATE INDEX IF NOT EXISTS smart_results_doc_mode_version_idx
  ON smart_results(document_id, mode, version);
CREATE INDEX IF NOT EXISTS smart_results_status_idx
  ON smart_results(status);
-- Note: SQLite doesn't support DESC in CREATE INDEX; query uses ORDER BY version DESC which SQLite handles efficiently
