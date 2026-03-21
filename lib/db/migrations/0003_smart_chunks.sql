-- 结构化翻译任务分块表
CREATE TABLE IF NOT EXISTS smart_chunks (
  id         TEXT PRIMARY KEY,
  result_id  TEXT NOT NULL REFERENCES smart_results(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,
  type       TEXT NOT NULL,
  meta       TEXT NOT NULL,
  content    TEXT NOT NULL,
  translated TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  error      TEXT,
  UNIQUE(result_id, idx)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS smart_chunks_result_idx ON smart_chunks(result_id);
