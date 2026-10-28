-- Durable single-flight/idempotency for chat requests across API instances.
-- A PENDING lease prevents concurrent workers from executing the same client
-- message; the response is stored so stream/sync retries can replay it.
CREATE TABLE IF NOT EXISTS chat_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  client_id TEXT,
  client_message_id TEXT NOT NULL,
  owner_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_idempotency_updated
  ON chat_idempotency (status, updated_at);
