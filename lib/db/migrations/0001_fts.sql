-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title,
  content,
  summary,
  content='documents',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, content, summary)
  VALUES (new.rowid, new.title, new.content, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content, summary)
  VALUES ('delete', old.rowid, old.title, old.content, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content, summary)
  VALUES ('delete', old.rowid, old.title, old.content, old.summary);
  INSERT INTO documents_fts(rowid, title, content, summary)
  VALUES (new.rowid, new.title, new.content, new.summary);
END;
