CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  completed_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_user_name ON shopping_items(user_id, normalized_name);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shopping_user_pending ON shopping_items(user_id, deleted_at, completed_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shopping_events (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, message_id)
);
